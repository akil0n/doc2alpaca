import { createClient, type RedisClientType } from "redis";

const globalForRedis = globalThis as unknown as {
  redis?: RedisClientType;
  redisConnecting?: Promise<void>;
};

function createRedisClient(): RedisClientType {
  const client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    disableOfflineQueue: true,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 500, 5000),
    },
  });
  client.on("error", (error) => {
    console.error("[redis] connection error:", error.message);
  });
  return client;
}

/** 惰性单例。fail-closed：Redis 不可用时所有命令立刻抛错，由调用方处理。 */
export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

/** 确保首次使用前连接已建立（避免与 connect() 的竞态）。 */
export async function ensureRedis(): Promise<void> {
  if (!globalForRedis.redisConnecting) {
    globalForRedis.redisConnecting = redis.connect().then(
      () => {},
      (error) => {
        console.error("[redis] initial connect failed:", error.message);
        globalForRedis.redisConnecting = undefined;
        throw error;
      }
    );
  }
  await globalForRedis.redisConnecting;
}

export async function redisPing(): Promise<boolean> {
  try {
    await ensureRedis();
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}
