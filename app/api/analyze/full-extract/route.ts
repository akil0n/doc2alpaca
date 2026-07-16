// ============================================================
// POST /api/analyze/full-extract — 全覆盖提取（SSE 流式）
//
// 将文档分块，每块独立调用 LLM 穷尽提取，最终全局去重。
// 支持续传：传入已有 sessionId 则跳过已完成的块。
// ============================================================

import { NextRequest } from "next/server";
import { readFile, unlink } from "fs/promises";
import { createHash } from "crypto";
import { extractTextFromFile } from "@/lib/textExtractor";
import { runFullExtraction } from "@/lib/datasetGeneration";
import { getConfig } from "@/lib/configService";
import {
  loadExtractionCheckpoint,
  isCheckpointCompatible,
  removeExtractionCheckpoint,
  saveExtractionCheckpoint,
} from "@/lib/extractionCheckpoint";
import type { FileType } from "@/types";
import type { LLMCallConfig } from "@/lib/aiClient";

export const runtime = "nodejs";

/**
 * POST /api/analyze/full-extract
 *
 * Body:
 *   filePath    — 上传的临时文件路径
 *   fileType    — 文件类型（pdf/docx/txt/md/html）
 *   fileName    — 源文件名
 *   maxCharsPerChunk — 每块最大字符数（可选，默认 6000）
 *   llmConfig   — LLM 调用配置（可选）
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  let isDone = false;

  const send = (controller: ReadableStreamDefaultController, event: string, data: unknown) => {
    if (isDone) return;
    try {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      );
    } catch {
      // 流已关闭
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const body = await request.json();
        const {
          filePath,
          fileType,
          fileName,
          maxCharsPerChunk,
          llmConfig,
          sessionId,
        } = body as {
          filePath: string;
          fileType: FileType;
          fileName: string;
          maxCharsPerChunk?: number;
          llmConfig?: LLMCallConfig;
          sessionId?: string;
        };

        // ---- 参数校验 ----
        if (!filePath || !fileType || !fileName) {
          send(controller, "error", { message: "缺少必要参数" });
          controller.close();
          isDone = true;
          return;
        }

        // ---- 配置检查 ----
        const hasClientConfig =
          llmConfig?.apiKey &&
          !llmConfig.apiKey.startsWith("your-") &&
          !llmConfig.apiKey.startsWith("sk-your");
        const hasEnvConfig = getConfig().hasApiKey;

        if (!hasClientConfig && !hasEnvConfig) {
          send(controller, "error", { message: "LLM API Key 未配置" });
          controller.close();
          isDone = true;
          return;
        }

        // ---- 读取文件 ----
        let buffer: Buffer;
        try {
          buffer = await readFile(filePath);
        } catch {
          send(controller, "error", { message: "无法读取文件" });
          controller.close();
          isDone = true;
          return;
        }

        // ---- 提取文本 ----
        let extracted;
        try {
          extracted = await extractTextFromFile(buffer, fileType, fileName);
        } catch {
          send(controller, "error", { message: "文本提取失败" });
          controller.close();
          isDone = true;
          return;
        }

        if (!extracted.text || extracted.text.trim().length === 0) {
          send(controller, "error", {
            message: "未能提取到文本内容，文档可能为扫描件",
          });
          controller.close();
        // The upload is no longer needed after extraction has produced an in-memory document.
        unlink(filePath).catch(() => {});

          isDone = true;
          return;
        }

        // ---- 发送文件信息 ----
        const effectiveSessionId = sessionId || `extract_${Date.now().toString(36)}`;
        const resolvedMaxChars = maxCharsPerChunk ?? 6000;
        const fingerprint = createHash("sha256")
          .update(extracted.text)
          .update(JSON.stringify({ fileType, maxCharsPerChunk: resolvedMaxChars, chunkOverlap: 240, schemaVersion: 1 }))
          .digest("hex");
        const storedCheckpoint = await loadExtractionCheckpoint(effectiveSessionId);
        const checkpoint = isCheckpointCompatible(storedCheckpoint, fingerprint) ? storedCheckpoint : null;
        if (storedCheckpoint && !checkpoint) await removeExtractionCheckpoint(effectiveSessionId);
        let checkpointWrites = 0;

        send(controller, "init", {
          fileName: extracted.sourceName,
          charCount: extracted.charCount,
          paragraphCount: extracted.paragraphCount,
          sessionId: effectiveSessionId,
        });

        // ---- 执行全覆盖提取 ----
        const result = await runFullExtraction(
          extracted,
          llmConfig,
          { maxCharsPerChunk: resolvedMaxChars },
          // 每块完成回调
          (chunkEvent) => {
            send(controller, "chunk", chunkEvent);
          },
          // 去重完成回调
          (dedupEvent) => {
            send(controller, "dedup", dedupEvent);
          },
          checkpoint,
          async (state) => {
            checkpointWrites++;
            if (checkpointWrites % 4 !== 0) return;
            await saveExtractionCheckpoint({
              sessionId: effectiveSessionId,
              fingerprint,
              schemaVersion: 1,
              sourceName: extracted.sourceName,
              completedChunkIds: state.completedChunkIds,
              items: state.items,
              updatedAt: Date.now(),
            });
          }
        );
        if (result.failures.length > 0) {
          await saveExtractionCheckpoint({
            sessionId: effectiveSessionId,
            fingerprint,
            schemaVersion: 1,
            sourceName: extracted.sourceName,
            completedChunkIds: result.completedChunkIds,
            items: result.items,
            updatedAt: Date.now(),
          });
        }



        // ---- 发送完成事件 ----
        send(controller, "done", {
          totalChunks: result.totalChunks,
          totalItems: result.totalAfterDedup,
          totalBeforeDedup: result.totalBeforeDedup,
          dedupRemoved: result.totalBeforeDedup - result.totalAfterDedup,
          failedChunks: result.failures.length,
          parseWarnings: result.parseErrors.length,
        });

        // ---- 发送完整数据 ----
        send(controller, "data", {
          items: result.items,
          diagnostics: {
            duplicateGroups: result.duplicateGroups,
            failures: result.failures,
          },
        });

        // 全部完成后清理断点；临时上传文件已在文本提取后释放。
        if (result.failures.length === 0) {
          await removeExtractionCheckpoint(effectiveSessionId);
        }

        controller.close();
        isDone = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "全覆盖提取过程出错";
        try {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`
            )
          );
        } catch {
          // 流已关闭
        }
        controller.close();
        isDone = true;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
