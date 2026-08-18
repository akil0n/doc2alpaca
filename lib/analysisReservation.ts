import { createHash, randomBytes } from "node:crypto";
import { ensureRedis, redis } from "@/lib/redis";

// 预约时间必须覆盖一次正常的深度分析；即使 worker 异常退出，锁也会自动过期，
// 不会永久阻止用户重新提交。同一个 session 的 RabbitMQ 重试沿用同一个预约。
const RESERVATION_TTL_SECONDS = 6 * 60 * 60;

function reservationKey(userId: string, uploadId: string): string {
  // 不把用户 ID 和上传令牌原文写进 Redis key，避免运维日志泄露标识符。
  const digest = createHash("sha256")
    .update(`${userId}\0${uploadId}`)
    .digest("hex");
  return `analysis:upload:${digest}`;
}

/**
 * 为“用户 + 上传”建立排他预约。成功时返回只有本任务知道的释放令牌；
 * 已被其他请求预约时返回 null，因此重复点击不会创建第二个分析任务。
 */
export async function reserveAnalysisUpload(
  userId: string,
  uploadId: string,
): Promise<string | null> {
  await ensureRedis();
  const token = randomBytes(32).toString("hex");
  const result = await redis.set(reservationKey(userId, uploadId), token, {
    NX: true,
    EX: RESERVATION_TTL_SECONDS,
  });
  return result === "OK" ? token : null;
}

/**
 * 只允许持有正确令牌的任务释放预约。Lua 脚本把“比较”和“删除”合成一次原子操作，
 * 防止旧 worker 误删刚由新请求建立的预约。
 */
export async function releaseAnalysisUpload(
  userId: string,
  uploadId: string,
  token: string,
): Promise<boolean> {
  await ensureRedis();
  const deleted = await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    {
      keys: [reservationKey(userId, uploadId)],
      arguments: [token],
    },
  );
  return Number(deleted) === 1;
}
