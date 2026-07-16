import type { QARecord } from "./qaPipeline.ts";

export interface DuplicateGroup {
  id: string;
  keptId: string;
  duplicateIds: string[];
  similarity: number;
  reason: "exact" | "near_duplicate";
}

export interface DeduplicationOptions { threshold?: number; }
export interface DeduplicationResult { items: QARecord[]; groups: DuplicateGroup[]; removed: number; }

/** Direct-representative clustering prevents transitive-chain data loss. */
export function deduplicateQARecords(records: QARecord[], options: DeduplicationOptions = {}): DeduplicationResult {
  const threshold = options.threshold ?? 0.78;
  if (records.length <= 1) return { items: records, groups: [], removed: 0 };

  const rankedIndexes = records.map((_, index) => index).sort((a, b) => compareQuality(records[b], records[a]));
  const keptIndexes: number[] = [];
  const duplicateMap = new Map<number, Array<{ index: number; similarity: number }>>();

  for (const candidateIndex of rankedIndexes) {
    let best: { keptIndex: number; similarity: number } | null = null;
    for (const keptIndex of keptIndexes) {
      const similarity = recordSimilarity(records[keptIndex], records[candidateIndex]);
      if (similarity >= threshold && (!best || similarity > best.similarity)) best = { keptIndex, similarity };
    }
    if (!best) {
      keptIndexes.push(candidateIndex);
      continue;
    }
    const duplicates = duplicateMap.get(best.keptIndex) || [];
    duplicates.push({ index: candidateIndex, similarity: best.similarity });
    duplicateMap.set(best.keptIndex, duplicates);
  }

  const groups: DuplicateGroup[] = [];
  const enriched = new Map<number, QARecord>();
  for (const [keptIndex, duplicates] of duplicateMap) {
    const exact = duplicates.every(({ index }) => normalized(records[index].instruction) === normalized(records[keptIndex].instruction));
    groups.push({
      id: `dup_${records[keptIndex].id}`,
      keptId: records[keptIndex].id,
      duplicateIds: duplicates.map(({ index }) => records[index].id),
      similarity: round(Math.max(...duplicates.map(({ similarity }) => similarity))),
      reason: exact ? "exact" : "near_duplicate",
    });
    enriched.set(keptIndex, {
      ...records[keptIndex],
      duplicateCandidates: duplicates.map(({ index, similarity }) => ({
        record: withoutDuplicateCandidates(records[index]),
        similarity: round(similarity),
      })),
    });
  }

  const keptSet = new Set(keptIndexes);
  const items = records.flatMap((record, index) => keptSet.has(index) ? [enriched.get(index) || record] : []);
  return { items, groups, removed: records.length - items.length };
}

export function recordSimilarity(a: QARecord, b: QARecord): number {
  const question = semanticLexicalSimilarity(a.instruction, b.instruction);
  if (question < 0.34) return question;
  const answer = semanticLexicalSimilarity(a.output, b.output);
  const sameSource = a.source.documentId === b.source.documentId ? 0.03 : 0;
  return Math.min(1, question * 0.78 + answer * 0.22 + sameSource);
}

function semanticLexicalSimilarity(a: string, b: string): number {
  const left = canonical(a);
  const right = canonical(b);
  if (left === right) return 1;
  return Math.max(jaccard(charSet(left), charSet(right)), jaccard(gramSet(left), gramSet(right)));
}

function canonical(value: string): string {
  return normalized(value)
    .replace(/设置|设定|调整/g, "配置")
    .replace(/怎样|怎么/g, "如何")
    .replace(/请问|如何|方法|步骤|流程|需要|应该|要|的|是/g, "");
}

function normalized(value: string): string { return value.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ""); }
function charSet(value: string): Set<string> { return new Set(value.split("")); }
function gramSet(value: string): Set<string> {
  if (value.length < 2) return charSet(value);
  const result = new Set<string>();
  for (let i = 0; i < value.length - 1; i++) result.add(value.slice(i, i + 2));
  return result;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
function compareQuality(a: QARecord, b: QARecord): number {
  return a.quality.overall - b.quality.overall || a.quality.groundedness - b.quality.groundedness || a.output.length - b.output.length;
}
function round(value: number): number { return Math.round(value * 1000) / 1000; }
function withoutDuplicateCandidates(record: QARecord): Omit<QARecord, "duplicateCandidates"> {
  const { duplicateCandidates: _duplicates, ...plain } = record;
  return plain;
}
