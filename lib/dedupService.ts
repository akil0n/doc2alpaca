// ============================================================
// DedupService — 全局去重服务
//
// 职责：跨分块去除重复或高度相似的问答对，
//       保留信息量更丰富的版本
// 不负责：调用 LLM、分块
// ============================================================

import type { AlpacaItem } from "@/types";

/** 默认相似度阈值（两个 instruction 超过此值视为重复） */
const DEFAULT_SIMILARITY_THRESHOLD = 0.88;

/** 默认 Jaccard n-gram 大小 */
const NGRAM_SIZE = 3;

/**
 * 跨块全局去重
 *
 * 对所有条目的 instruction 进行两两相似度比较，
 * 超过阈值的视为重复，保留 output 较长（信息量更大）的那条。
 *
 * @param items 所有分块提取的原始条目
 * @param threshold 相似度阈值（默认 0.88）
 * @returns 去重后的条目
 */
export function deduplicateItems(
  items: AlpacaItem[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): { items: AlpacaItem[]; removed: number } {
  if (items.length <= 1) {
    return { items, removed: 0 };
  }

  const keep: boolean[] = new Array(items.length).fill(true);

  for (let i = 0; i < items.length; i++) {
    if (!keep[i]) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (!keep[j]) continue;

      const sim = computeItemSimilarity(items[i], items[j]);

      if (sim >= threshold) {
        // 保留 output 更长的那个
        if (items[i].output.length >= items[j].output.length) {
          keep[j] = false;
        } else {
          keep[i] = false;
          break; // items[i] 被淘汰，不再比较它
        }
      }
    }
  }

  const deduped = items.filter((_, idx) => keep[idx]);
  return { items: deduped, removed: items.length - deduped.length };
}

/**
 * 计算两条 AlpacaItem 的相似度
 *
 * 综合考虑 instruction 和 output 的文本相似度。
 * instruction 权重更高（0.7），output 权重较低（0.3）。
 */
function computeItemSimilarity(a: AlpacaItem, b: AlpacaItem): number {
  const instSim = jaccardSimilarity(normalize(a.instruction), normalize(b.instruction));

  // instruction 完全不同 → 直接判定不重复
  if (instSim < 0.3) return instSim;

  // instruction 有一定相似 → 结合 output 判定
  const outSim = jaccardSimilarity(normalize(a.output), normalize(b.output));

  return instSim * 0.7 + outSim * 0.3;
}

// ============================================================
// 工具函数（与 deepEngine.ts 保持一致）
// ============================================================

/**
 * 标准化文本：去标点、转小写、去空白
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Jaccard 相似度（基于字符 n-gram 集合）
 *
 * 对中文效果较好，默认 3-gram。
 */
export function jaccardSimilarity(a: string, b: string, n: number = NGRAM_SIZE): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set<string>();
  const setB = new Set<string>();

  for (let i = 0; i <= a.length - n; i++) setA.add(a.slice(i, i + n));
  for (let i = 0; i <= b.length - n; i++) setB.add(b.slice(i, i + n));

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 按 instruction 去重（更严格：完全相同的 instruction 只保留一条）
 */
export function deduplicateByInstruction(items: AlpacaItem[]): AlpacaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalize(item.instruction);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
