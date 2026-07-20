import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60 * 60 * 1000;

export async function consumeUserRateLimit(
  userId: string,
  action: "upload" | "analysis",
  maxRequests: number
): Promise<boolean> {
  const now = Date.now();
  const windowNumber = Math.floor(now / WINDOW_MS);
  const id = `${userId}:${action}:${windowNumber}`;
  const bucket = await prisma.userRateLimit.upsert({
    where: { id },
    create: {
      id,
      userId,
      action,
      count: 1,
      expiresAt: new Date((windowNumber + 2) * WINDOW_MS),
    },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  if (Math.random() < 0.01) {
    prisma.userRateLimit
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});
  }
  return bucket.count <= maxRequests;
}
