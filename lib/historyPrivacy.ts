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
  }
): string {
  return JSON.stringify({
    purpose: "generated-history",
    userId,
    id,
    fileType: metadata.fileType,
    itemCount: metadata.itemCount,
    isBatch: metadata.isBatch,
    createdAt: metadata.createdAt.toISOString(),
  });
}
