import type { AlpacaItem, FileType } from "../types/index.ts";

export type ReviewStatus = "pending" | "accepted" | "rejected" | "needs_revision";
export type QATaskType = "closed_book_qa" | "reading_comprehension" | "extraction" | "analysis";

export interface SourceEvidence {
  documentId: string;
  fileName: string;
  fileType: FileType;
  chunkId: string;
  heading?: string;
  startOffset: number;
  endOffset: number;
  text: string;
  available?: boolean;
}

export interface QualityResult {
  groundedness: number;
  completeness: number;
  clarity: number;
  relevance: number;
  overall: number;
  flags: string[];
  method?: "heuristic_prescreen";
  evidenceAvailable?: boolean;
}

export interface QARecord extends AlpacaItem {
  id: string;
  source: SourceEvidence;
  quality: QualityResult;
  reviewStatus: ReviewStatus;
  taskType: QATaskType;
  createdAt: number;
  duplicateCandidates?: Array<{
    record: Omit<QARecord, "duplicateCandidates">;
    similarity: number;
  }>;
}

export function createQARecord(
  item: AlpacaItem,
  source: SourceEvidence,
  options: Partial<Pick<QARecord, "reviewStatus" | "taskType" | "createdAt">> = {}
): QARecord {
  const normalizedItem = {
    instruction: item.instruction.trim(),
    input: (item.input || "").trim(),
    output: item.output.trim(),
  };
  const quality = evaluateQAQuality(normalizedItem, source.text, source.available !== false);

  return {
    ...normalizedItem,
    id: `qa_${stableHash(`${source.documentId}|${source.chunkId}|${normalizedItem.instruction}|${normalizedItem.output}`)}`,
    source,
    quality,
    reviewStatus: options.reviewStatus ?? "pending",
    taskType: options.taskType ?? inferTaskType(normalizedItem),
    createdAt: options.createdAt ?? Date.now(),
  };
}

export function evaluateQAQuality(item: AlpacaItem, evidence: string, evidenceAvailable = true): QualityResult {
  const flags: string[] = [];
  const groundedness = evidenceAvailable ? clamp(overlapScore(item.output, evidence)) : 0;

  const answerLength = normalizeText(item.output).length;
  const completeness = clamp(answerLength < 8 ? 0.25 : answerLength < 20 ? 0.62 : answerLength > 1800 ? 0.7 : 0.92);

  const questionLength = normalizeText(item.instruction).length;
  const ambiguous = /^(这|那|它|其|上述|以下|文中|该内容|这个)/.test(item.instruction.trim());
  const clarity = clamp(
    (questionLength >= 5 && questionLength <= 160 ? 0.94 : 0.55) -
      (ambiguous && !item.input.trim() ? 0.28 : 0)
  );

  const questionEvidence = overlapScore(item.instruction, evidence);
  const questionAnswer = overlapScore(item.instruction, item.output);
  const relevance = clamp(Math.max(questionEvidence, questionAnswer) * 0.55 + 0.42);

  if (!evidenceAvailable) flags.push("原文证据不可用，忠实度需要人工复核");
  else if (groundedness < 0.45) flags.push("答案与原文证据词面重合度较低，需要人工核验");
  if (completeness < 0.5) flags.push("回答过短，可能不完整");
  if (clarity < 0.7) flags.push("问题依赖模糊指代，脱离上下文后可能难以理解");
  if (/详见|如上|略|无法回答/.test(item.output)) flags.push("回答包含低信息量表述");
  if (item.instruction.length > 500 || item.output.length > 4000) flags.push("字段过长，建议拆分");

  const overall = evidenceAvailable
    ? clamp(groundedness * 0.42 + completeness * 0.2 + clarity * 0.2 + relevance * 0.18)
    : clamp(completeness * 0.34 + clarity * 0.34 + relevance * 0.32);

  return {
    groundedness: round(groundedness),
    method: "heuristic_prescreen",
    evidenceAvailable,
    completeness: round(completeness),
    clarity: round(clarity),
    relevance: round(relevance),
    overall: round(overall),
    flags,
  };
}

export function reEvaluateRecord(record: QARecord): QARecord {
  return {
    ...record,
    quality: evaluateQAQuality(record, record.source.text, record.source.available !== false),
  };
}

function inferTaskType(item: AlpacaItem): QATaskType {
  if (item.input.trim()) return "reading_comprehension";
  if (/提取|列出|找出|抽取/.test(item.instruction)) return "extraction";
  if (/分析|比较|为什么|原因|影响/.test(item.instruction)) return "analysis";
  return "closed_book_qa";
}

function overlapScore(candidate: string, reference: string): number {
  const candidateUnits = textUnits(candidate);
  const referenceUnits = new Set(textUnits(reference));
  if (candidateUnits.length === 0 || referenceUnits.size === 0) return 0;
  const matched = candidateUnits.filter((unit) => referenceUnits.has(unit)).length;
  return matched / candidateUnits.length;
}

function textUnits(text: string): string[] {
  const normalized = normalizeText(text);
  const latin = normalized.match(/[a-z0-9][a-z0-9._+-]*/g) || [];
  const han = normalized.replace(/[a-z0-9._+-]+/g, "").replace(/\s+/g, "");
  const grams: string[] = [];
  for (let i = 0; i < han.length - 1; i++) grams.push(han.slice(i, i + 2));
  if (han.length === 1) grams.push(han);
  return [...new Set([...latin, ...grams])];
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff._+\-]+/g, " ").trim();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
