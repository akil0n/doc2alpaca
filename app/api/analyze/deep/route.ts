// ============================================================
// POST /api/analyze/deep — 深度提取（SSE 流式）
//
// 对单一文档进行多轮 LLM 提取，每轮结束后推送进度事件。
// 支持断点续传：传入已有 sessionId 则自动恢复。
// ============================================================

import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { extractTextFromFile } from "@/lib/textExtractor";
import { runDeepAnalysis } from "@/lib/deepEngine";
import { createSession, getSession, updateSession } from "@/lib/sessionManager";
import { getConfig } from "@/lib/configService";
import type { FileType } from "@/types";
import type { LLMCallConfig } from "@/lib/aiClient";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      filePath,
      fileType,
      fileName,
      sessionId: existingSessionId,
      maxRounds,
      llmConfig,
    } = body as {
      filePath: string;
      fileType: FileType;
      fileName: string;
      sessionId?: string;
      maxRounds?: number;
      llmConfig?: LLMCallConfig;
    };

    // ---- 参数校验 ----
    if (!filePath || !fileType || !fileName) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: "缺少必要参数" })}\n\n`,
        {
          status: 200, // SSE 必须 200
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }

    // ---- 配置检查 ----
    const hasClientConfig =
      llmConfig?.apiKey &&
      !llmConfig.apiKey.startsWith("your-") &&
      !llmConfig.apiKey.startsWith("sk-your");
    const hasEnvConfig = getConfig().hasApiKey;

    if (!hasClientConfig && !hasEnvConfig) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: "LLM API Key 未配置" })}\n\n`,
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }

    // ---- 读取文件 ----
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: "无法读取文件" })}\n\n`,
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }

    // ---- 提取文本 ----
    let extracted;
    try {
      extracted = await extractTextFromFile(buffer, fileType, fileName);
    } catch {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: "文本提取失败" })}\n\n`,
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }

    if (!extracted.text || extracted.text.trim().length === 0) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ message: "未能提取到文本内容，文档可能为扫描件" })}\n\n`,
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }
      );
    }

    // ---- 会话管理：新建 or 恢复 ----
    let session;
    if (existingSessionId) {
      session = await getSession(existingSessionId);
      if (session) {
        // 已完成的会话不允许继续
        if (session.status === "completed") {
          return new Response(
            `event: error\ndata: ${JSON.stringify({ message: "该任务已完成，无需继续" })}\n\n`,
            {
              status: 200,
              headers: { "Content-Type": "text/event-stream" },
            }
          );
        }
        // 恢复：更新状态为 running
        session = await updateSession(existingSessionId, { status: "running" });
      }
    }

    if (!session) {
      // 创建新会话
      session = await createSession(
        { filePath, fileName, fileType },
        maxRounds ? { maxRounds } : undefined
      );
    }

    // ---- SSE 流 ----
    const encoder = new TextEncoder();
    let isDone = false;

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          if (isDone) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            // 流已关闭
          }
        };

        // 发送 session 信息（前端用于持久化）
        send("init", { sessionId: session!.sessionId });

        // 执行深度提取
        runDeepAnalysis(extracted!, session!, llmConfig, (roundEvent) => {
          send("round", roundEvent);
        })
          .then((final) => {
            send("done", {
              sessionId: session!.sessionId,
              totalRounds: final.totalRounds,
              totalItems: final.totalItems,
            });
            controller.close();
            isDone = true;
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : "深度提取过程出错";
            send("error", { message: msg });
            // 标记会话为中断
            updateSession(session!.sessionId, { status: "interrupted" }).catch(() => {});
            controller.close();
            isDone = true;
          });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : "服务端错误" })}\n\n`,
      {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }
    );
  }
}
