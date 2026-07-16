// ============================================================
// Chunker — 文档文本分片器
//
// 职责：将长文档按语义边界（Markdown 标题、段落）拆分为
//       大小合适的块，块间带重叠，确保不截断关键信息
// 不负责：调用 LLM、提取文本
// ============================================================

import type { TextChunk } from "@/types";

/** 默认每块最大字符数 */
const DEFAULT_MAX_CHARS = 6000;

/** 块间重叠字符数 */
const DEFAULT_OVERLAP = 200;

/**
 * 将文档文本拆分为语义块
 *
 * 分片策略（优先级）：
 *   1. Markdown 标题（## / #）— 按章节拆
 *   2. 段落边界（连续两个换行）— 自然段落拆
 *   3. 句子边界（句号/问号/感叹号）— 长度超限时的软边界
 *   4. 强制截断 — 以上均不满足时在字符边界拆
 *
 * @param text 文档纯文本
 * @param maxChars 每块最大字符数（默认 6000）
 * @param overlap 块间重叠字符数（默认 200）
 * @returns 分块数组
 */
export function chunkDocument(
  text: string,
  maxChars: number = DEFAULT_MAX_CHARS,
  overlap: number = DEFAULT_OVERLAP
): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  // Step 1: 按 Markdown 标题预分
  const sections = splitByHeadings(text);

  // Step 2: 将过大的段落下钻拆分
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    if (section.text.length <= maxChars) {
      chunks.push(makeChunk(section.text, section.heading, chunkIndex++, text));
    } else {
      // 大段落需要进一步拆分
      const subChunks = splitLargeSection(section, maxChars, overlap);
      for (const sc of subChunks) {
        chunks.push(makeChunk(sc.text, sc.heading || section.heading, chunkIndex++, text));
      }
    }
  }

  return chunks;
}

// ============================================================
// 内部实现
// ============================================================

/** 预分段落 */
interface Section {
  heading: string;
  text: string;
}

/**
 * 按 Markdown 标题拆分文本
 *
 * 匹配 ## 和 # 开头的行作为章节边界。
 * 若文档没有 Markdown 标题，则整个文本作为一个段落。
 */
function splitByHeadings(text: string): Section[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const matches: { index: number; level: number; title: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      level: match[1].length,
      title: match[2].trim(),
    });
  }

  if (matches.length === 0) {
    // 无标题 → 整个文本作为一段
    return [{ heading: "", text }];
  }

  const sections: Section[] = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const heading = matches[i].title;
    const sectionText = text.slice(start, end).trim();

    if (sectionText.length > 0) {
      sections.push({ heading, text: sectionText });
    }
  }

  return sections;
}

/**
 * 将过大的段落按段落边界、句子边界拆分
 *
 * 每块不超过 maxChars，之间带 overlap 字符的重叠。
 */
function splitLargeSection(
  section: Section,
  maxChars: number,
  overlap: number
): Section[] {
  const text = section.text;
  const sections: Section[] = [];

  let start = 0;

  while (start < text.length) {
    let end = findSplitPoint(text, start, maxChars);

    // 最后一块
    if (end >= text.length) {
      sections.push({
        heading: section.heading,
        text: text.slice(start).trim(),
      });
      break;
    }

    sections.push({
      heading: section.heading,
      text: text.slice(start, end).trim(),
    });

    // 下一块从 end - overlap 开始（重叠区域）
    start = Math.max(end - overlap, start + 1);
  }

  return sections;
}

/**
 * 找到合适的拆分点
 *
 * 优先级：
 *   1. 段落边界（\n\n）
 *   2. 句子结束（。！？）
 *   3. 行尾（\n）
 *   4. 直接 maxChars 截断
 */
function findSplitPoint(text: string, start: number, maxChars: number): number {
  const end = start + maxChars;
  if (end >= text.length) return text.length;

  const searchWindow = text.slice(start, end);

  // 1. 倒序找段落边界
  const paraIdx = searchWindow.lastIndexOf("\n\n");
  if (paraIdx > maxChars * 0.3) {
    return start + paraIdx;
  }

  // 2. 倒序找句子结束
  const sentenceEnd = Math.max(
    searchWindow.lastIndexOf("。"),
    searchWindow.lastIndexOf("！"),
    searchWindow.lastIndexOf("？"),
    searchWindow.lastIndexOf(".\n"),
    searchWindow.lastIndexOf("\n")
  );
  if (sentenceEnd > maxChars * 0.3) {
    return start + sentenceEnd + 1;
  }

  // 3. 直接 maxChars 截断
  return end;
}

/**
 * 构造一个 TextChunk
 */
function makeChunk(
  text: string,
  heading: string | undefined,
  index: number,
  fullText: string
): TextChunk {
  const startOffset = findOffset(fullText, text);
  return {
    id: `chunk_${String(index + 1).padStart(3, "0")}`,
    text,
    startOffset,
    endOffset: startOffset + text.length,
    index: index + 1,
    total: 0, // 将在完成后赋值
    heading: heading || undefined,
  };
}

/**
 * 在完整文本中查找子串的偏移量
 *
 * 精确匹配前 50 个字符，避免截断匹配导致的错误。
 */
function findOffset(fullText: string, subText: string): number {
  const sample = subText.slice(0, 50).trim();
  const idx = fullText.indexOf(sample);
  return idx !== -1 ? idx : 0;
}

/**
 * 便捷方法：给所有块设置 total 值
 */
export function setTotalOnChunks(chunks: TextChunk[], total: number): TextChunk[] {
  return chunks.map((c) => ({ ...c, total }));
}
