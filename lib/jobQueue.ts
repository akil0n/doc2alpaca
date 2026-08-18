// ============================================================
// jobQueue — RabbitMQ 工作队列封装（amqplib v2）
//
// 经典"工作队列"模式（Work Queue）：
//
//   Producer（API 路由）                    Consumer（独立 worker 进程）
//   publishAnalysisJob(job)  ──→ 队列 ──→  consumeAnalysisJobs(handler)
//
// 三个核心机制（面试重点）：
//   1. 持久化（durable + persistent）：消息落盘，RabbitMQ 重启不丢
//   2. at-least-once：消费成功才 ack；失败重投（带次数上限）
//   3. 死信队列（DLX）：重试耗尽的消息进"死信队列"人工排查，
//      绝不悄悄丢弃
// ============================================================

import {
  connect,
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
} from "amqplib";

const QUEUE = "doc2alpaca.analysis";
const DLX = "doc2alpaca.dlx";
const DLQ = "doc2alpaca.analysis.dead";
const MAX_ATTEMPTS = 3;

export interface AnalysisJob {
  sessionId: string;
  userId: string;
  uploadId: string;
  /** Redis 上传级预约的所有权令牌，只允许持有者释放。 */
  reservationToken: string;
  /** 已重试次数（0 起）。由 consumer 重投时 +1。 */
  attempts?: number;
}

const globalForRabbit = globalThis as unknown as {
  rabbit?: ChannelModel;
  rabbitConnecting?: Promise<ChannelModel>;
};

function rabbitUrl(): string {
  return process.env.RABBITMQ_URL || "amqp://localhost:5672";
}

/** 惰性单例连接，并缓存首次连接 Promise，避免并发请求创建多条连接。 */
async function getModel(): Promise<ChannelModel> {
  if (globalForRabbit.rabbit) return globalForRabbit.rabbit;
  if (!globalForRabbit.rabbitConnecting) {
    globalForRabbit.rabbitConnecting = connect(rabbitUrl())
      .then((model) => {
        model.on("close", () => {
          globalForRabbit.rabbit = undefined;
        });
        globalForRabbit.rabbit = model;
        return model;
      })
      .finally(() => {
        globalForRabbit.rabbitConnecting = undefined;
      });
  }
  return globalForRabbit.rabbitConnecting;
}

/**
 * 声明队列拓扑（幂等）：主队列 + 死信交换机 + 死信队列。
 * 主队列配置 deadLetterExchange：被 nack(requeue=false) 的消息自动转入 DLX。
 */
async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(DLX, "fanout", { durable: true });
  await channel.assertQueue(DLQ, { durable: true });
  await channel.bindQueue(DLQ, DLX, "");
  await channel.assertQueue(QUEUE, {
    durable: true,
    deadLetterExchange: DLX,
  });
}

// ===================== Producer 端 =====================

/** 发布分析任务。API 路由在几十毫秒内返回，重活在 worker。 */
export async function publishAnalysisJob(job: AnalysisJob): Promise<void> {
  const model = await getModel();
  const channel = await model.createConfirmChannel();
  try {
    await assertTopology(channel);
    // persistent 请求消息持久化；publisher confirm 证明 broker 已经接收。
    channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(job)), {
      persistent: true,
      contentType: "application/json",
      type: "doc2alpaca.analysis.v1",
      messageId: job.sessionId,
    });
    await channel.waitForConfirms();
  } finally {
    await channel.close();
  }
}

// ===================== Consumer 端 =====================

export interface JobHandler {
  (job: AnalysisJob): Promise<void>;
}

export interface AnalysisConsumerOptions {
  /** 连接断开后由 worker 进程退出，让进程管理器重启并重新注册 consumer。 */
  onDisconnect?: (error: Error) => void;
  /** 最终重试失败、消息进入死信队列前同步业务状态。 */
  onDeadLetter?: (job: AnalysisJob, error: unknown) => Promise<void>;
}

export interface AnalysisConsumerHandle {
  close(): Promise<void>;
}

export function parseAnalysisJob(value: string): AnalysisJob | null {
  try {
    const parsed = JSON.parse(value) as Partial<AnalysisJob> | null;
    if (
      !parsed ||
      typeof parsed.sessionId !== "string" ||
      !/^session_[a-f0-9]{48}$/.test(parsed.sessionId) ||
      typeof parsed.userId !== "string" ||
      parsed.userId.length === 0 ||
      typeof parsed.uploadId !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.uploadId) ||
      typeof parsed.reservationToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.reservationToken) ||
      (parsed.attempts !== undefined &&
        (!Number.isInteger(parsed.attempts) ||
          parsed.attempts < 0 ||
          parsed.attempts >= MAX_ATTEMPTS))
    ) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      userId: parsed.userId,
      uploadId: parsed.uploadId,
      reservationToken: parsed.reservationToken,
      ...(parsed.attempts === undefined ? {} : { attempts: parsed.attempts }),
    };
  } catch {
    return null;
  }
}

/**
 * 消费分析任务。回调抛错时自动重投（最多 MAX_ATTEMPTS 次），
 * 耗尽后进死信队列。handler 只写业务逻辑，重试/死信交给这里。
 *
 * @param handler 业务处理函数（成功返回 / 失败抛错）
 */
export async function consumeAnalysisJobs(
  handler: JobHandler,
  options: AnalysisConsumerOptions = {},
): Promise<AnalysisConsumerHandle> {
  const model = await getModel();
  const channel: ConfirmChannel = await model.createConfirmChannel();
  model.once("close", () => {
    options.onDisconnect?.(new Error("RabbitMQ connection closed"));
  });
  // prefetch(1)：同一时刻只处理一个任务 —— 单 worker 串行，多 worker 并行
  await channel.prefetch(1);
  await assertTopology(channel);

  let activeJobs = 0;
  let resolveIdle: (() => void) | undefined;
  const waitForIdle = () =>
    activeJobs === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          resolveIdle = resolve;
        });

  const consumer = await channel.consume(QUEUE, async (msg) => {
    if (!msg) return; // consumer 被取消时的空回调
    activeJobs += 1;

    try {
      const job = parseAnalysisJob(msg.content.toString());
      if (!job) {
        // 无法解析或结构不合法的消息：ack 掉，避免毒消息阻塞业务死信队列。
        channel.ack(msg);
        return;
      }

      const attempts = job.attempts ?? 0;
      try {
        await handler(job);
        channel.ack(msg); // 成功：确认，消息出队
      } catch (error) {
        console.error(
          `[worker] job ${job.sessionId} failed (attempt ${attempts + 1}/${MAX_ATTEMPTS}):`,
          error instanceof Error ? error.message : String(error),
        );
        if (attempts + 1 < MAX_ATTEMPTS) {
          try {
            channel.sendToQueue(
              QUEUE,
              Buffer.from(JSON.stringify({ ...job, attempts: attempts + 1 })),
              {
                persistent: true,
                contentType: "application/json",
                type: "doc2alpaca.analysis.v1",
                messageId: job.sessionId,
              },
            );
            // 确认新消息已被 broker 接收后，才能删除当前消息。
            await channel.waitForConfirms();
            channel.ack(msg);
          } catch (republishError) {
            console.error(
              `[worker] failed to republish job ${job.sessionId}:`,
              republishError instanceof Error
                ? republishError.message
                : String(republishError),
            );
            // 保留原消息；连接断开时 RabbitMQ 会自动重新投递未确认消息。
            try {
              channel.nack(msg, false, true);
            } catch {
              // channel 已关闭时无需再次处理，broker 会恢复未确认消息。
            }
          }
        } else {
          // 重试耗尽：nack(requeue=false) → 自动转入死信队列
          console.error(
            `[worker] job ${job.sessionId} dead-lettered after ${MAX_ATTEMPTS} attempts`,
          );
          try {
            await options.onDeadLetter?.(job, error);
          } catch (statusError) {
            console.error(
              `[worker] failed to persist dead-letter status for ${job.sessionId}:`,
              statusError instanceof Error
                ? statusError.message
                : String(statusError),
            );
          }
          channel.nack(msg, false, false);
        }
      }
    } finally {
      activeJobs -= 1;
      if (activeJobs === 0) {
        resolveIdle?.();
        resolveIdle = undefined;
      }
    }
  });

  return {
    async close() {
      await channel.cancel(consumer.consumerTag).catch(() => {});
      await waitForIdle();
      await channel.close().catch(() => {});
    },
  };
}

/** 关闭共享连接；consumer 应先通过 handle.close() 停止并等待在途任务。 */
export async function closeRabbit(): Promise<void> {
  if (!globalForRabbit.rabbit) return;
  await globalForRabbit.rabbit.close();
  globalForRabbit.rabbit = undefined;
  globalForRabbit.rabbitConnecting = undefined;
}
