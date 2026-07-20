import { NextRequest } from "next/server";
import { currentUserId } from "@/lib/authGuard";
import { consumeUserRateLimit } from "@/lib/rateLimit";
import { runFullExtraction } from "@/lib/datasetGeneration";
import { purgeExtractionCheckpoints } from "@/lib/extractionCheckpoint";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { extractTextFromFile } from "@/lib/textExtractor";
import { claimUpload } from "@/lib/uploadStore";
import { resolveLlmConfig, saveGeneratedHistory } from "@/lib/userDataStore";

export const runtime = "nodejs";


export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return new Response("拒绝跨站请求。", { status: 403 });
  }

  const encoder = new TextEncoder();
  let isDone = false;
  let claimed: Awaited<ReturnType<typeof claimUpload>> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (isDone) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          isDone = true;
        }
      };
      const close = () => {
        if (isDone) return;
        try {
          controller.close();
        } catch {
          // The browser may already have disconnected.
        }
        isDone = true;
      };

      try {
        const body = await request.json();
        const { uploadId, maxCharsPerChunk, sessionId } = body as {
          uploadId?: string;
          maxCharsPerChunk?: number;
          sessionId?: string;
        };
        const userId = await currentUserId();
        if (!uploadId || !userId) {
          send("error", { message: "上传令牌无效或已过期" });
          close();
          return;
        }

        await purgeExtractionCheckpoints();
        claimed = await claimUpload(uploadId, userId);
        if (!(await consumeUserRateLimit(userId, "analysis", 20))) {
          send("error", { message: "分析请求过于频繁，请稍后再试" });
          close();
          return;
        }

        const llmConfig = await resolveLlmConfig(userId);
        if (!llmConfig) {
          send("error", { message: "LLM API Key 未配置" });
          close();
          return;
        }

        let extracted;
        try {
          extracted = await extractTextFromFile(
            claimed.buffer,
            claimed.fileType,
            claimed.fileName
          );
        } catch {
          send("error", { message: "文本提取失败" });
          close();
          return;
        }

        // The file is no longer needed once its contents are in memory.
        await claimed.dispose();
        claimed = null;

        if (!extracted.text || extracted.text.trim().length === 0) {
          send("error", { message: "未能提取到文本内容，文档可能为扫描件" });
          close();
          return;
        }

        const resolvedMaxChars = maxCharsPerChunk ?? 6000;
        const requestedSessionId =
          sessionId || `extract_${Date.now().toString(36)}`;
        send("init", {
          fileName: extracted.sourceName,
          charCount: extracted.charCount,
          paragraphCount: extracted.paragraphCount,
          sessionId: requestedSessionId,
        });

        const result = await runFullExtraction(
          extracted,
          llmConfig,
          { maxCharsPerChunk: resolvedMaxChars },
          (chunkEvent) => send("chunk", chunkEvent),
          (dedupEvent) => send("dedup", dedupEvent),
          null,
          undefined,
          request.signal
        );

        await saveGeneratedHistory(userId, { items: result.items });

        send("done", {
          totalChunks: result.totalChunks,
          totalItems: result.totalAfterDedup,
          totalBeforeDedup: result.totalBeforeDedup,
          dedupRemoved: result.totalBeforeDedup - result.totalAfterDedup,
          failedChunks: result.failures.length,
          parseWarnings: result.parseErrors.length,
        });
        send("data", {
          items: result.items,
          diagnostics: {
            duplicateGroups: result.duplicateGroups,
            failures: result.failures,
          },
        });
        close();
      } catch (error) {
        const message =
          error instanceof Error && error.message === "Upload not found"
            ? "上传令牌无效、已使用或已过期"
            : error instanceof Error
              ? error.message
              : "全覆盖提取过程出错";
        send("error", { message });
        close();
      } finally {
        await claimed?.dispose().catch(() => {});
        claimed = null;
      }
    },
    async cancel() {
      isDone = true;
      await claimed?.dispose().catch(() => {});
      claimed = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
