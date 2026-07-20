"use client";

import type { HistoryRecord } from "@/types";

const LEGACY_STORAGE_KEY = "doc2alpaca_history";

export function clearLegacyHistory(): void {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {}
}

async function jsonOrThrow(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "历史记录请求失败");
  return data;
}

export async function getHistory(): Promise<HistoryRecord[]> {
  clearLegacyHistory();
  const data = await jsonOrThrow(await fetch("/api/history", { cache: "no-store" }));
  return data.records || [];
}

export async function deleteHistory(id: string): Promise<boolean> {
  const data = await jsonOrThrow(
    await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" })
  );
  return data.deleted > 0;
}

export async function clearHistory(): Promise<void> {
  await jsonOrThrow(await fetch("/api/history", { method: "DELETE" }));
}
