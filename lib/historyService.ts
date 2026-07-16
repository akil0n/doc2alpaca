// ============================================================
// HistoryService — 历史记录服务
//
// 职责：管理数据集生成历史记录，持久化到 LocalStorage
// 不负责：数据集内容生成、导出
// ============================================================

"use client";

import type { HistoryRecord, AlpacaItem } from "@/types";

const STORAGE_KEY = "doc2alpaca_history";
const MAX_RECORDS = 50;

/**
 * 获取所有历史记录（按时间倒序）
 */
export function getHistory(): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 保存一条历史记录
 *
 * @param fileName 源文件名
 * @param fileType 文件类型
 * @param items 数据集内容
 * @param templateId 使用的模板 ID
 * @param isBatch 是否批量处理
 * @param batchFiles 批量文件列表（可选）
 */
export function saveHistory(
  fileName: string,
  fileType: string,
  items: AlpacaItem[],
  templateId: string,
  isBatch = false,
  batchFiles?: string[]
): HistoryRecord {
  const record: HistoryRecord = {
    id: `hist_${Date.now()}`,
    fileName,
    fileType,
    createdAt: Date.now(),
    itemCount: items.length,
    templateId,
    items,
    isBatch,
    batchFiles,
  };

  const history = getHistory();
  history.unshift(record);

  // 限制最大记录数
  if (history.length > MAX_RECORDS) {
    history.length = MAX_RECORDS;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // LocalStorage 满时静默处理
  }

  return record;
}

/**
 * 删除一条历史记录
 */
export function deleteHistory(id: string): boolean {
  const history = getHistory();
  const filtered = history.filter((r) => r.id !== id);
  if (filtered.length === history.length) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * 清空所有历史记录
 */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默处理
  }
}
