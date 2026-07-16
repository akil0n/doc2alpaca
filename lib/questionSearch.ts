import type { QARecord, ReviewStatus, QATaskType } from "./qaPipeline.ts";

export type SearchMode = "keyword" | "fuzzy" | "hybrid";

export interface QuestionSearchQuery {
  query?: string;
  mode?: SearchMode;
  reviewStatuses?: ReviewStatus[];
  taskTypes?: QATaskType[];
  fileNames?: string[];
  minQuality?: number;
  maxQuality?: number;
  limit?: number;
}

export interface QuestionSearchResult {
  record: QARecord;
  score: number;
  matchedFields: Array<"instruction" | "input" | "output" | "heading" | "fileName">;
}

interface IndexedRecord {
  record: QARecord;
  fields: Record<QuestionSearchResult["matchedFields"][number], string>;
  tokens: Record<QuestionSearchResult["matchedFields"][number], string[]>;
  grams: Record<QuestionSearchResult["matchedFields"][number], string[]>;
}

const FIELD_WEIGHTS: Record<keyof IndexedRecord["fields"], number> = {
  instruction: 4,
  input: 1.25,
  output: 2.2,
  heading: 1.8,
  fileName: 0.75,
};

/**
 * 面向审核工作台的小型本地混合检索索引。
 * 精确词命中与字符 n-gram 模糊召回被隐藏在一个同步接口后，
 * 后续可在同一 seam 替换为 SQLite FTS 或向量适配器。
 */
export class QuestionSearchIndex {
  private readonly indexed: IndexedRecord[];

  constructor(records: QARecord[]) {
    this.indexed = records.map((record) => {
      const fields = {
        instruction: normalize(record.instruction),
        input: normalize(record.input),
        output: normalize(record.output),
        heading: normalize(record.source.heading || ""),
        fileName: normalize(record.source.fileName),
      };
      return {
        record,
        fields,
        grams: mapValues(fields, (text) => ngrams(text, 2)),
        tokens: mapValues(fields, tokenize),
      };
    });
  }

  search(query: QuestionSearchQuery): QuestionSearchResult[] {
    const filtered = this.indexed.filter(({ record }) => matchesFilters(record, query));
    const rawQuery = normalize(query.query || "");
    const limit = Math.max(1, query.limit ?? 100);

    if (!rawQuery) {
      return filtered
        .map(({ record }) => ({ record, score: record.quality.overall, matchedFields: [] }))
        .sort((a, b) => b.score - a.score || b.record.createdAt - a.record.createdAt)
        .slice(0, limit);
    }

    const queryTokens = tokenize(rawQuery);
    const queryGrams = ngrams(rawQuery, 2);
    const mode = query.mode ?? "hybrid";

    return filtered
      .map((item) => scoreRecord(item, rawQuery, queryTokens, queryGrams, mode))
      .filter((result) => result.score > 0.025)
      .sort((a, b) => b.score - a.score || b.record.quality.overall - a.record.quality.overall)
      .slice(0, limit);
  }
}

function scoreRecord(
  item: IndexedRecord,
  rawQuery: string,
  queryTokens: string[],
  queryGrams: string[],
  mode: SearchMode
): QuestionSearchResult {
  let weightedScore = 0;
  let totalWeight = 0;
  const matchedFields: QuestionSearchResult["matchedFields"] = [];

  for (const key of Object.keys(FIELD_WEIGHTS) as Array<keyof typeof FIELD_WEIGHTS>) {
    const text = item.fields[key];
    const weight = FIELD_WEIGHTS[key];
    totalWeight += weight;

    const exact = text.includes(rawQuery) ? 1 : tokenCoverage(queryTokens, item.tokens[key]);
    const fuzzy = dice(queryGrams, item.grams[key]);
    const fieldScore = mode === "keyword" ? exact : mode === "fuzzy" ? fuzzy : exact * 0.64 + fuzzy * 0.36;

    if (fieldScore > 0.06) matchedFields.push(key);
    weightedScore += fieldScore * weight;
  }

  const coverageBonus = matchedFields.length > 1 ? Math.min(0.12, matchedFields.length * 0.025) : 0;
  return {
    record: item.record,
    score: round(weightedScore / totalWeight + coverageBonus),
    matchedFields,
  };
}

function matchesFilters(record: QARecord, query: QuestionSearchQuery): boolean {
  if (query.reviewStatuses?.length && !query.reviewStatuses.includes(record.reviewStatus)) return false;
  if (query.taskTypes?.length && !query.taskTypes.includes(record.taskType)) return false;
  if (query.fileNames?.length && !query.fileNames.includes(record.source.fileName)) return false;
  if (query.minQuality !== undefined && record.quality.overall < query.minQuality) return false;
  if (query.maxQuality !== undefined && record.quality.overall > query.maxQuality) return false;
  return true;
}

function tokenize(text: string): string[] {
  const canonical = canonicalize(text);
  const latin = canonical.match(/[a-z0-9][a-z0-9._+-]*/g) || [];
  const hanSegments = canonical.match(/[\u3400-\u9fff]+/g) || [];
  const han = hanSegments.flatMap((segment) => {
    const values = [segment];
    for (let i = 0; i < segment.length - 1; i++) values.push(segment.slice(i, i + 2));
    return values;
  });
  return [...new Set([...latin, ...han])];
}

function canonicalize(text: string): string {
  return text
    .replace(/设置|设定|调整/g, "配置")
    .replace(/怎样|怎么|如何进行/g, "如何")
    .replace(/步骤|流程|办法/g, "方法");
}

function normalize(text: string): string {
  return canonicalize(text.toLowerCase())
    .replace(/[^a-z0-9\u3400-\u9fff._+\-]+/g, " ")
    .trim();
}

function tokenCoverage(query: string[], candidate: string[]): number {
  if (!query.length || !candidate.length) return 0;
  const set = new Set(candidate);
  const important = query.filter((token) => token.length > 1);
  const source = important.length ? important : query;
  return source.filter((token) => set.has(token)).length / source.length;
}

function ngrams(text: string, size: number): string[] {
  const compact = text.replace(/\s+/g, "");
  if (!compact) return [];
  if (compact.length <= size) return [compact];
  const result: string[] = [];
  for (let i = 0; i <= compact.length - size; i++) result.push(compact.slice(i, i + size));
  return [...new Set(result)];
}

function dice(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  let intersection = 0;
  for (const value of new Set(a)) if (bSet.has(value)) intersection++;
  return (2 * intersection) / (new Set(a).size + bSet.size);
}

function mapValues<T extends Record<string, string>, R>(
  value: T,
  mapper: (text: string) => R
): { [K in keyof T]: R } {
  return Object.fromEntries(Object.entries(value).map(([key, text]) => [key, mapper(text)])) as {
    [K in keyof T]: R;
  };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
