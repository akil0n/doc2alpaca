// ============================================================
// deepWorker — RabbitMQ 深度提取消费者（独立进程）
//
// 启动：npm run worker（开发时 npm run worker:dev 自动重启）
//
// 职责：消费队列中的分析任务，执行重活：
//   认领上传 → 提取文本 → 多轮 LLM 分析 → 保存历史 → 标记完成
//
// 与 API 路由进程完全解耦：
//   - API 挂掉不影响已入队任务继续执行
//   - worker 挂掉，消息不会被 ack，重连后继续消费
//   - 挂 N 个 worker 进程 = 并行处理 N 个任务
// ============================================================

import { config as loadEnv } from "dotenv";

// 先加载 .env.local（优先），再补 .env —— 保证本地变量覆盖
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import {
  consumeAnalysisJobs,
  closeRabbit,
  type AnalysisJob,
} from "@/lib/jobQueue";
import { runDeepAnalysis } from "@/lib/deepEngine";
import { claimUpload } from "@/lib/uploadStore";
import {
  getSession,
  sessionBelongsTo,
  updateSession,
} from "@/lib/sessionManager";
import { extractTextFromFile } from "@/lib/textExtractor";
import { resolveLlmConfig, saveGeneratedHistory } from "@/lib/userDataStore";
import { releaseAnalysisUpload } from "@/lib/analysisReservation";

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function releaseReservation(job: AnalysisJob): Promise<void> {
  await releaseAnalysisUpload(
    job.userId,
    job.uploadId,
    job.reservationToken,
  ).catch((error) => {
    // 预约本身有 TTL；清理失败不应让已经完成/终止的任务再次调用 LLM。
    console.error(
      `[worker] failed to release upload reservation for ${job.sessionId}:`,
      error instanceof Error ? error.message : String(error),
    );
  });
}

async function handleJob(job: AnalysisJob): Promise<void> {
  const session = await getSession(job.sessionId);
  if (!session) {
    console.warn(`[worker] session ${job.sessionId} not found, ack & skip`);
    await releaseReservation(job);
    return;
  }
  if (
    !sessionBelongsTo(session, job.userId) ||
    session.sourceFile.uploadId !== job.uploadId
  ) {
    console.error(
      `[worker] rejected inconsistent job payload for ${job.sessionId}`,
    );
    await releaseReservation(job);
    return;
  }
  if (session.status === "completed" || session.status === "aborted") {
    console.info(
      `[worker] session ${job.sessionId} is ${session.status}, ack duplicate & skip`,
    );
    await releaseReservation(job);
    return;
  }

  // ---- 1. 认领上传（一次性：content → claimed；重试时回退 claimed）----
  // 失败路径故意不 dispose，队列重试/用户续跑仍然需要原文件。
  const claimed = await claimUpload(session.sourceFile.uploadId, job.userId, {
    allowReclaim: true,
  });

  // ---- 2. 标记运行中（前端轮询能看到状态流转 queued → running）----
  await updateSession(job.sessionId, { status: "running" });
  console.log(
    `[worker] ${job.sessionId} → running (${session.sourceFile.fileName})`,
  );

  // ---- 3. 提取文本 ----
  const extracted = await extractTextFromFile(
    claimed.buffer,
    claimed.fileType,
    claimed.fileName,
  );
  if (!extracted.text || extracted.text.trim().length === 0) {
    throw new Error("未能提取到文本内容，文档可能为扫描件");
  }

  // ---- 4. 多轮 LLM 深度提取（进度自动写入 progress.jsonl）----
  const llmConfig = await resolveLlmConfig(job.userId);
  if (!llmConfig) throw new Error("LLM API Key 未配置");

  const final = await runDeepAnalysis(extracted, session, llmConfig);
  console.log(
    `[worker] ${job.sessionId} → done: ${final.totalRounds} 轮 / ${final.totalItems} 条`,
  );

  // ---- 5. 保存历史 + 标记完成 ----
  await saveGeneratedHistory(job.userId, {
    items: final.items,
    sourceSessionId: job.sessionId,
  });
  await updateSession(job.sessionId, { status: "completed" });
  await claimed.dispose().catch(() => {});
  await releaseReservation(job);
}

async function main() {
  console.log(`[worker] starting, queue consumer pid=${process.pid}`);
  let shuttingDown = false;
  let consumer: Awaited<ReturnType<typeof consumeAnalysisJobs>> | undefined;

  // ---- 优雅退出：SIGINT/SIGTERM 时先收尾再断开 ----
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[worker] shutting down gracefully…");
    const timer = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    await consumer?.close();
    await closeRabbit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  consumer = await consumeAnalysisJobs(handleJob, {
    onDeadLetter: async (job, error) => {
      try {
        await updateSession(job.sessionId, { status: "interrupted" });
      } finally {
        // 即使会话文件损坏或已经消失，也不能把上传预约一直占住。
        await releaseReservation(job);
      }
      console.error(
        `[worker] session ${job.sessionId} marked interrupted after final failure:`,
        error instanceof Error ? error.message : String(error),
      );
    },
    onDisconnect: (error) => {
      if (shuttingDown) return;
      console.error(
        `[worker] fatal: ${error.message}; exiting for process-manager restart`,
      );
      process.exit(1);
    },
  });
}

main().catch((error) => {
  console.error(
    "[worker] fatal:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
