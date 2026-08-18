import type { AlpacaItem } from "@/types";

export function canonicalizeGeneratedItems(value: unknown): AlpacaItem[] {
  if (!Array.isArray(value) || value.length > 20_000) {
    throw new Error("INVALID_HISTORY");
  }
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.instruction !== "string" ||
      typeof item.input !== "string" ||
      typeof item.output !== "string"
    ) {
      throw new Error("INVALID_HISTORY");
    }
    return {
      instruction: item.instruction,
      input: item.input,
      output: item.output,
    };
  });
}

export function historyAssociatedData(
  userId: string,
  id: string,
  metadata: {
    fileType: string;
    itemCount: number;
    isBatch: boolean;
    createdAt: Date;
    sourceSessionId?: string | null;
  },
): string {
  const associatedData = {
    purpose: "generated-history",
    userId,
    id,
    fileType: metadata.fileType,
    itemCount: metadata.itemCount,
    isBatch: metadata.isBatch,
    createdAt: metadata.createdAt.toISOString(),
  };
  // 旧记录没有 sourceSessionId。仅在新队列记录存在该字段时加入 AAD，
  // 保持已经加密的历史记录仍可按原格式解密。
  return JSON.stringify(
    metadata.sourceSessionId
      ? { ...associatedData, sourceSessionId: metadata.sourceSessionId }
      : associatedData,
  );
}
