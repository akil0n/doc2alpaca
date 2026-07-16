// ============================================================
// ExportService — 数据导出服务
//
// 职责：将数据集导出为 JSON 文件下载或复制到剪贴板，
//       支持 Alpaca 和 ShareGPT 两种格式
// 不负责：生成数据集内容、预览数据
// ============================================================

import type { AlpacaItem, ExportFormat } from "@/types";

/**
 * 将 Alpaca 条目转换为 ShareGPT 格式
 *
 * Alpaca instruction/input/output → ShareGPT human/gpt 对话对。
 * instruction 和 input 合并为 human 消息，output 为 gpt 消息。
 */
function convertToShareGpt(items: AlpacaItem[]): unknown[] {
  return items.map((item) => {
    const humanValue = item.input
      ? `${item.instruction}\n\n${item.input}`
      : item.instruction;

    return {
      conversations: [
        { from: "human", value: humanValue },
        { from: "gpt", value: item.output },
      ],
    };
  });
}

/**
 * 生成指定格式的 JSON 字符串
 *
 * @param items Alpaca 数据集条目
 * @param format 导出格式（alpaca 或 sharegpt）
 * @returns 美化输出的 JSON 字符串（2 空格缩进）
 */
export function formatJson(
  items: AlpacaItem[],
  format: ExportFormat = "alpaca"
): string {
  const managed = items.some((item) => "reviewStatus" in item);
  const exportableItems = managed
    ? items.filter((item) => (item as AlpacaItem & { reviewStatus?: string }).reviewStatus === "accepted")
    : items;
  if (format === "sharegpt") {
    return JSON.stringify(convertToShareGpt(exportableItems), null, 2);
  }
  return JSON.stringify(
    exportableItems.map((item) => ({
      instruction: item.instruction,
      input: item.input,
      output: item.output,
    })),
    null,
    2
  );
}

/**
 * 下载数据集为 JSON 文件
 *
 * @param items Alpaca 数据集条目
 * @param format 导出格式
 * @param filename 下载文件名（可选）
 */
export function downloadAsJson(
  items: AlpacaItem[],
  format: ExportFormat = "alpaca",
  filename?: string
): void {
  if (typeof window === "undefined") return;
  const managed = items.some((item) => "reviewStatus" in item);
  const hasAccepted = items.some((item) => (item as AlpacaItem & { reviewStatus?: string }).reviewStatus === "accepted");
  if (managed && !hasAccepted) {
    window.alert("当前没有已接受的问答。请先在审核工作台接受至少一条数据后再导出。");
    return;
  }

  const defaultName =
    format === "sharegpt" ? "sharegpt_dataset.json" : "alpaca_dataset.json";
  const json = formatJson(items, format);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || defaultName;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 复制数据集 JSON 到剪贴板
 *
 * @param items Alpaca 数据集条目
 * @param format 导出格式
 * @returns 是否复制成功
 */
export async function copyToClipboard(
  items: AlpacaItem[],
  format: ExportFormat = "alpaca"
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  try {
    const json = formatJson(items, format);
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}
