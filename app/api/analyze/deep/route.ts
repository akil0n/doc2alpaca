import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/authGuard";
import { consumeUserRateLimit } from "@/lib/rateLimit";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import {
  createSession,
  getSession,
  sessionBelongsTo,
  updateSession,
} from "@/lib/sessionManager";
import { peekUpload } from "@/lib/uploadStore";
import { resolveLlmConfig } from "@/lib/userDataStore";
import { publishAnalysisJob } from "@/lib/jobQueue";
import {
  releaseAnalysisUpload,
  reserveAnalysisUpload,
} from "@/lib/analysisReservation";

export const runtime = "nodejs";

/**
 * 深度提取 — 异步队列模式（Producer）。
 *
 * 只做轻活并立即返回（202）：
 *   1. 校验：同源 / 登录 / 上传所有权 / LLM 配置 / 限流
 *   2. 建会话（status=queued）
 *   3. 把任务发布到 RabbitMQ，真正分析由 deepWorker 消费
 *
 * 前端随后用 GET /api/progress?sessionId=... 轮询进度。
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "拒绝跨站请求" }, { status: 403 });
  }

  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是有效的 JSON" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const uploadId = typeof input.uploadId === "string" ? input.uploadId : "";
  const existingSessionId =
    typeof input.sessionId === "string" ? input.sessionId : undefined;
  const maxRounds = input.maxRounds;

  if (!uploadId) {
    return NextResponse.json(
      { error: "上传令牌无效或已过期" },
      { status: 400 },
    );
  }
  if (
    maxRounds !== undefined &&
    (typeof maxRounds !== "number" ||
      !Number.isInteger(maxRounds) ||
      maxRounds < 1 ||
      maxRounds > 20)
  ) {
    return NextResponse.json(
      { error: "maxRounds 必须是 1 到 20 的整数" },
      { status: 400 },
    );
  }

  try {
    // 只读校验所有权，不消费上传 —— 消费发生在 worker 进程
    const upload = await peekUpload(uploadId, userId);

    // fail-fast：LLM 配置缺失立即告知，不浪费一个队列任务
    const llmConfig = await resolveLlmConfig(userId);
    if (!llmConfig) {
      return NextResponse.json(
        { error: "LLM API Key 未配置" },
        { status: 400 },
      );
    }

    // “用户 + 上传”只能有一个在途任务，防止双击/并发请求重复调用 LLM。
    // 只有消息被 RabbitMQ 确认后，释放责任才转交给 worker。
    const reservationToken = await reserveAnalysisUpload(userId, uploadId);
    if (!reservationToken) {
      return NextResponse.json(
        { error: "该上传已在分析中，请勿重复提交" },
        { status: 409 },
      );
    }
    let published = false;

    try {
      // 只有通过格式、上传归属和 LLM 配置检查的请求才消耗分析额度。
      if (!(await consumeUserRateLimit(userId, "analysis", 20))) {
        return NextResponse.json(
          { error: "分析请求过于频繁，请稍后再试" },
          { status: 429 },
        );
      }

      // 新建或复用会话（支持断点续跑）
      let session;
      if (existingSessionId) {
        session = await getSession(existingSessionId);
        if (!session || !sessionBelongsTo(session, userId)) {
          return NextResponse.json({ error: "会话不存在" }, { status: 404 });
        }
        if (session.sourceFile.uploadId !== uploadId) {
          return NextResponse.json(
            { error: "上传文件与会话不匹配" },
            { status: 400 },
          );
        }
        if (session.status === "completed") {
          return NextResponse.json(
            { error: "该任务已完成，无需继续" },
            { status: 409 },
          );
        }
        if (session.status === "queued" || session.status === "running") {
          return NextResponse.json(
            {
              error: "该任务正在处理中，请勿重复提交",
              sessionId: session.sessionId,
              status: session.status,
            },
            { status: 409 },
          );
        }
        session = await updateSession(existingSessionId, { status: "queued" });
      }
      if (!session) {
        session = await createSession(
          {
            uploadId,
            fileName: `uploaded-document.${upload.fileType}`,
            fileType: upload.fileType,
          },
          typeof maxRounds === "number" ? { maxRounds } : undefined,
          userId,
        );
        session = await updateSession(session.sessionId, { status: "queued" });
      }
      if (!session) throw new Error("Session state update failed");

      // 只有 RabbitMQ 确认消息后才返回 202；发布失败则恢复为可重试状态。
      try {
        await publishAnalysisJob({
          sessionId: session.sessionId,
          userId,
          uploadId,
          reservationToken,
        });
        published = true;
      } catch (error) {
        await updateSession(session.sessionId, { status: "interrupted" }).catch(
          () => {},
        );
        throw error;
      }

      return NextResponse.json(
        {
          sessionId: session.sessionId,
          status: "queued",
          pollUrl: `/api/progress?sessionId=${session.sessionId}`,
        },
        { status: 202 },
      );
    } finally {
      if (!published) {
        await releaseAnalysisUpload(userId, uploadId, reservationToken).catch(
          (error) => {
            // Redis 预约带 TTL；释放失败不会掩盖原始 HTTP 响应，稍后会自动过期。
            console.error(
              "failed to release unpublished analysis reservation:",
              error instanceof Error ? error.message : String(error),
            );
          },
        );
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Upload not found") {
      return NextResponse.json(
        { error: "上传令牌无效、已使用或已过期" },
        { status: 400 },
      );
    }
    console.error("enqueue deep analysis failed:", msg);
    return NextResponse.json(
      { error: "任务入队失败，请稍后重试" },
      { status: 500 },
    );
  }
}
