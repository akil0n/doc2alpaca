import { NextRequest } from "next/server";
import { currentUserId } from "@/lib/authGuard";
import { consumeUserRateLimit } from "@/lib/rateLimit";
import { runDeepAnalysis } from "@/lib/deepEngine";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { createSession, getSession, sessionBelongsTo, updateSession } from "@/lib/sessionManager";
import { extractTextFromFile } from "@/lib/textExtractor";
import { claimUpload } from "@/lib/uploadStore";
import { resolveLlmConfig, saveGeneratedHistory } from "@/lib/userDataStore";

export const runtime = "nodejs";

function sseError(message: string, status = 200): Response {
  return new Response(
    `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
    { status, headers: { "Content-Type": "text/event-stream" } }
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return sseError("拒绝跨站请求", 403);

  let claimed: Awaited<ReturnType<typeof claimUpload>> | null = null;
  try {
    const body = await request.json();
    const {
      uploadId,
      sessionId: existingSessionId,
      maxRounds,
    } = body as {
      uploadId?: string;
      sessionId?: string;
      maxRounds?: number;
    };
    const userId = await currentUserId();
    if (!uploadId || !userId) return sseError("上传令牌无效或已过期");

    claimed = await claimUpload(uploadId, userId);
    if (!(await consumeUserRateLimit(userId, "analysis", 20))) return sseError("分析请求过于频繁，请稍后再试", 429);

    const llmConfig = await resolveLlmConfig(userId);
    if (!llmConfig) {
      return sseError("LLM API Key 未配置");
    }

    let extracted;
    try {
      extracted = await extractTextFromFile(
        claimed.buffer,
        claimed.fileType,
        claimed.fileName
      );
    } catch {
      return sseError("文本提取失败");
    }

    const sourceFile = {
      uploadId,
      fileName: `uploaded-document.${claimed.fileType}`,
      fileType: claimed.fileType,
    };
    await claimed.dispose();
    claimed = null;

    if (!extracted.text || extracted.text.trim().length === 0) {
      return sseError("未能提取到文本内容，文档可能为扫描件");
    }

    let session;
    if (existingSessionId) {
      session = await getSession(existingSessionId);
      if (session && !sessionBelongsTo(session, userId)) {
        return sseError("会话不存在");
      }
      if (session?.status === "completed") {
        return sseError("该任务已完成，无需继续");
      }
      if (session) {
        session = await updateSession(existingSessionId, { status: "running" });
      }
    }
    if (!session) {
      session = await createSession(
        sourceFile,
        maxRounds ? { maxRounds } : undefined,
        userId
      );
    }

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
            isDone = true;
          }
        };
        const close = () => {
          if (isDone) return;
          try {
            controller.close();
          } catch {
            // Browser disconnected.
          }
          isDone = true;
        };

        send("init", { sessionId: session!.sessionId });
        runDeepAnalysis(extracted!, session!, llmConfig, (event) => {
          send("round", event);
        }, request.signal)
          .then(async (final) => {
            await saveGeneratedHistory(userId, { items: final.items });
            send("done", {
              sessionId: session!.sessionId,
              totalRounds: final.totalRounds,
              totalItems: final.totalItems,
            });
            close();
          })
          .catch((error) => {
            send("error", {
              message:
                error instanceof Error ? error.message : "深度提取过程出错",
            });
            updateSession(session!.sessionId, { status: "interrupted" }).catch(
              () => {}
            );
            close();
          });
      },
      cancel() {
        isDone = true;
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
  } catch (error) {
    return sseError(
      error instanceof Error && error.message === "Upload not found"
        ? "上传令牌无效、已使用或已过期"
        : "服务端错误"
    );
  } finally {
    await claimed?.dispose().catch(() => {});
  }
}
