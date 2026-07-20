import { prisma } from "@/lib/prisma";

const MAX_DAILY_CALLS = 200;
const MAX_DAILY_TOKENS = 1_000_000;

function dayKey(userId: string, now = new Date()): string {
  return `${userId}:${now.toISOString().slice(0, 10)}`;
}

export async function reserveLlmCall(
  userId: string,
  tokenBudget: number
): Promise<boolean> {
  if (!Number.isSafeInteger(tokenBudget) || tokenBudget <= 0) return false;
  const id = dayKey(userId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`llm-quota:${id}`}))`;
    const current = await tx.dailyLlmUsage.findUnique({ where: { id } });
    if (
      (current?.callCount || 0) >= MAX_DAILY_CALLS ||
      (current?.totalTokens || 0) + tokenBudget > MAX_DAILY_TOKENS
    ) {
      return false;
    }
    await tx.dailyLlmUsage.upsert({
      where: { id },
      create: {
        id,
        userId,
        day: new Date(new Date().toISOString().slice(0, 10)),
        callCount: 1,
        totalTokens: tokenBudget,
      },
      update: {
        callCount: { increment: 1 },
        totalTokens: { increment: tokenBudget },
      },
    });
    return true;
  });
}

export async function reconcileLlmTokens(
  userId: string,
  reservedTokens: number,
  actualTokens: number
): Promise<void> {
  if (!Number.isSafeInteger(actualTokens) || actualTokens <= 0) {
    // Missing provider usage is not trustworthy: retain the conservative reservation.
    return;
  }
  await prisma.dailyLlmUsage.update({
    where: { id: dayKey(userId) },
    data: { totalTokens: { increment: actualTokens - reservedTokens } },
  });
}

export async function releaseLlmReservation(
  userId: string,
  reservedTokens: number
): Promise<void> {
  await prisma.dailyLlmUsage.update({
    where: { id: dayKey(userId) },
    data: { totalTokens: { decrement: reservedTokens } },
  });
}
