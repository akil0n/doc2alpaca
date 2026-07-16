import type { TextChunk } from "../types/index.ts";

export interface StructuredChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

interface Section {
  start: number;
  end: number;
  heading?: string;
}

/**
 * 保留源文档绝对偏移的结构化分块器。
 * 标题只决定知识边界，切块文本始终直接来自原始字符串切片。
 */
export function chunkStructuredDocument(
  text: string,
  options: StructuredChunkOptions = {}
): TextChunk[] {
  if (!text.trim()) return [];

  const maxChars = Math.max(32, options.maxChars ?? 6000);
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? 240, Math.floor(maxChars * 0.4)));
  const sections = findSections(text);
  const raw: Array<Omit<TextChunk, "id" | "index" | "total">> = [];

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    // Do not borrow text from the previous section and then label it with the
    // current heading: that would make source attribution misleading.
    let cursor = section.start;
    const sectionEnd = section.end;

    while (cursor < sectionEnd) {
      const proposedEnd = Math.min(cursor + maxChars, sectionEnd);
      const end = proposedEnd < sectionEnd ? findBoundary(text, cursor, proposedEnd) : sectionEnd;
      const safeEnd = Math.max(cursor + 1, end);
      raw.push({
        text: text.slice(cursor, safeEnd),
        startOffset: cursor,
        endOffset: safeEnd,
        heading: section.heading,
      });

      if (safeEnd >= sectionEnd) break;
      cursor = Math.max(cursor + 1, safeEnd - overlapChars);
    }
  }

  return raw.map((chunk, index) => ({
    ...chunk,
    id: `chunk_${String(index + 1).padStart(3, "0")}`,
    index: index + 1,
    total: raw.length,
  }));
}

function findSections(text: string): Section[] {
  const headingPattern = /^(?:#{1,6}\s+(.+)|={3,}\s*第\s*\d+\s*页\s*={3,}|第[一二三四五六七八九十百千万0-9]+[章节篇部]\s*[^\n]*)$/gm;
  const headings: Array<{ start: number; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingPattern.exec(text)) !== null) {
    headings.push({
      start: match.index,
      title: (match[1] || match[0]).replace(/^#+\s*/, "").replace(/^=+|=+$/g, "").trim(),
    });
  }

  if (!headings.length) return [{ start: 0, end: text.length }];

  const sections: Section[] = [];
  if (headings[0].start > 0 && text.slice(0, headings[0].start).trim()) {
    sections.push({ start: 0, end: headings[0].start, heading: "前言" });
  }
  for (let index = 0; index < headings.length; index++) {
    sections.push({
      start: headings[index].start,
      end: index + 1 < headings.length ? headings[index + 1].start : text.length,
      heading: headings[index].title,
    });
  }
  return sections;
}

function findBoundary(text: string, start: number, proposedEnd: number): number {
  const min = start + Math.floor((proposedEnd - start) * 0.45);
  const window = text.slice(min, proposedEnd);
  const candidates = [
    window.lastIndexOf("\n\n"),
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
    window.lastIndexOf(".\n"),
    window.lastIndexOf("\n"),
  ];
  const relative = Math.max(...candidates);
  if (relative < 0) return proposedEnd;
  const delimiterLength = window.slice(relative, relative + 2) === "\n\n" ? 2 : 1;
  return min + relative + delimiterLength;
}
