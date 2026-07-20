import type { HistoryRecord } from "@/types";
import type { LLMCallConfig } from "@/lib/aiClient";
import { getConfig } from "@/lib/configService";
import {
  canonicalizeGeneratedItems,
  historyAssociatedData,
} from "@/lib/historyPrivacy";
import { localLLMEndpointsAllowed, validateLLMBaseUrl } from "@/lib/llmEndpointPolicy";
import { prisma } from "@/lib/prisma";
import { decryptJson, encryptJson } from "@/lib/serverCrypto";

const MAX_HISTORY_RECORDS = 50;
const MAX_HISTORY_BYTES = 5 * 1024 * 1024;

interface StoredLlmConfig extends LLMCallConfig {
  vendorId: string;
}

interface HistoryPayload {
  templateId: string;
  items: ReturnType<typeof canonicalizeGeneratedItems>;
}

function encryptedColumns(value: ReturnType<typeof encryptJson>) {
  return {
    ciphertext: value.ciphertext,
    iv: value.iv,
    authTag: value.authTag,
    keyVersion: value.keyVersion,
  };
}

export async function getLlmConfigMetadata(userId: string) {
  const row = await prisma.userLlmConfig.findUnique({ where: { userId } });
  if (!row) {
    const global = getConfig();
    return {
      configured: global.hasApiKey,
      source: global.hasApiKey ? "server" : "none",
      vendorId: global.provider,
      baseUrl: global.baseUrl,
      model: global.model,
    };
  }
  const config = decryptJson<StoredLlmConfig>(row, `user:${userId}:llm-config`);
  return {
    configured: Boolean(config.apiKey),
    source: "user",
    vendorId: config.vendorId,
    baseUrl: config.baseUrl,
    model: config.model,
  };
}

export async function saveLlmConfig(
  userId: string,
  input: { vendorId: string; apiKey?: string; baseUrl: string; model: string }
) {
  if (!/^[a-z0-9_-]{1,32}$/i.test(input.vendorId)) throw new Error("INVALID_VENDOR");
  if (!input.model.trim() || input.model.length > 200) throw new Error("INVALID_MODEL");
  const baseUrl = await validateLLMBaseUrl(input.baseUrl, {
    allowLocal: localLLMEndpointsAllowed(),
  });
  let apiKey = input.apiKey?.trim() || "";
  if (!apiKey) {
    const previous = await prisma.userLlmConfig.findUnique({ where: { userId } });
    if (!previous) throw new Error("API_KEY_REQUIRED");
    apiKey = decryptJson<StoredLlmConfig>(
      previous,
      `user:${userId}:llm-config`
    ).apiKey;
  }
  if (apiKey.length < 6 || apiKey.length > 4096) throw new Error("INVALID_API_KEY");
  const encrypted = encryptJson(
    { vendorId: input.vendorId, apiKey, baseUrl, model: input.model.trim() },
    `user:${userId}:llm-config`
  );
  await prisma.userLlmConfig.upsert({
    where: { userId },
    create: { userId, ...encryptedColumns(encrypted) },
    update: encryptedColumns(encrypted),
  });
  return getLlmConfigMetadata(userId);
}

export async function deleteLlmConfig(userId: string): Promise<void> {
  await prisma.userLlmConfig.delete({ where: { userId } }).catch(() => {});
}

export async function resolveLlmConfig(userId: string): Promise<LLMCallConfig | undefined> {
  const row = await prisma.userLlmConfig.findUnique({ where: { userId } });
  if (row) {
    const config = decryptJson<StoredLlmConfig>(row, `user:${userId}:llm-config`);
    return { apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, userId };
  }
  const global = getConfig();
  if (!global.hasApiKey) return undefined;
  return {
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: global.baseUrl,
    model: global.model,
    userId,
  };
}

export async function saveGeneratedHistory(
  userId: string,
  input: { items: unknown; templateId?: string; isBatch?: boolean }
): Promise<HistoryRecord> {
  const items = canonicalizeGeneratedItems(input.items);
  const templateId =
    typeof input.templateId === "string" && input.templateId.length <= 100
      ? input.templateId
      : "default";
  const isBatch = input.isBatch === true;
  const payload: HistoryPayload = { templateId, items };
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_HISTORY_BYTES) {
    throw new Error("HISTORY_TOO_LARGE");
  }

  const id = crypto.randomUUID();
  const createdAt = new Date();
  const metadata = { fileType: "json", itemCount: items.length, isBatch, createdAt };
  const encrypted = encryptJson(
    payload,
    historyAssociatedData(userId, id, metadata)
  );
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`history:${userId}`}))`;
    await tx.generatedHistory.create({
      data: { id, userId, ...encryptedColumns(encrypted), ...metadata },
    });
    const overflow = await tx.generatedHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: MAX_HISTORY_RECORDS,
      select: { id: true },
    });
    if (overflow.length) {
      await tx.generatedHistory.deleteMany({
        where: { userId, id: { in: overflow.map((row) => row.id) } },
      });
    }
  });
  return {
    id,
    fileName: "生成结果",
    fileType: metadata.fileType,
    createdAt: createdAt.getTime(),
    itemCount: items.length,
    templateId,
    items,
    isBatch,
  };
}

export async function listGeneratedHistory(userId: string): Promise<HistoryRecord[]> {
  const rows = await prisma.generatedHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_RECORDS,
  });
  return rows.map((row) => {
    const payload = decryptJson<HistoryPayload>(
      row,
      historyAssociatedData(userId, row.id, row)
    );
    return {
      id: row.id,
      fileName: "生成结果",
      createdAt: row.createdAt.getTime(),
      itemCount: row.itemCount,
      fileType: row.fileType,
      isBatch: row.isBatch,
      templateId: payload.templateId,
      items: payload.items,
    };
  });
}

export async function deleteGeneratedHistory(userId: string, id?: string): Promise<number> {
  const result = await prisma.generatedHistory.deleteMany({
    where: id ? { id, userId } : { userId },
  });
  return result.count;
}
