import type { AlpacaItem, ExtractedText, LLMRequest, TextChunk } from "@/types";
import { callLLM, type LLMCallConfig } from "@/lib/aiClient";
import { parseAlpacaResponse } from "@/lib/resultParser";
import { chunkStructuredDocument } from "@/lib/documentChunker";
import { createQARecord, type QARecord } from "@/lib/qaPipeline";
import { deduplicateQARecords, type DuplicateGroup } from "@/lib/qaDeduplication";

export interface GenerationChunkEvent {
  done: number;
  total: number;
  newItems: number;
  totalItems: number;
  currentChunkId: string;
  status?: "completed" | "failed" | "retrying";
  message?: string;
}

export interface GenerationFailure {
  chunkId: string;
  heading?: string;
  attempts: number;
  message: string;
}

export interface FullExtractConfig {
  maxCharsPerChunk?: number;
  chunkOverlap?: number;
  dedupThreshold?: number;
  temperature?: number;
  maxAttemptsPerChunk?: number;
}

export interface FullExtractionResult {
  items: QARecord[];
  completedChunkIds: string[];
  totalChunks: number;
  totalBeforeDedup: number;
  totalAfterDedup: number;
  duplicateGroups: DuplicateGroup[];
  failures: GenerationFailure[];
  parseErrors: string[];
}
export interface GenerationResumeState {
  completedChunkIds: string[];
  items: QARecord[];
}


const DEFAULT_CONFIG: Required<FullExtractConfig> = {
  maxCharsPerChunk: 6000,
  chunkOverlap: 240,
  dedupThreshold: 0.78,
  temperature: 0.2,
  maxAttemptsPerChunk: 3,
};

/**
 * 数据集生成的唯一外部 seam：负责结构化分块、逐块容错生成、
 * 来源绑定、质量计算和可审计去重。
 */
export async function runFullExtraction(
  extracted: ExtractedText,
  llmConfig?: LLMCallConfig,
  config?: FullExtractConfig,
  onChunk?: (event: GenerationChunkEvent) => void,
  onDedup?: (event: { before: number; after: number; removed: number }) => void,
  resumeState?: GenerationResumeState | null,
  onCheckpoint?: (state: GenerationResumeState) => void | Promise<void>,
  signal?: AbortSignal
): Promise<FullExtractionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const chunks = chunkStructuredDocument(extracted.text, {
    maxChars: cfg.maxCharsPerChunk,
    overlapChars: cfg.chunkOverlap,
  });
  const documentId = createDocumentId(extracted);
  const allItems: QARecord[] = [...(resumeState?.items || [])];
  const completedChunkIds = new Set(resumeState?.completedChunkIds || []);
  const failures: GenerationFailure[] = [];
  const parseErrors: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (completedChunkIds.has(chunk.id)) {
      onChunk?.({
        done: index + 1,
        total: chunks.length,
        newItems: 0,
        totalItems: allItems.length,
        currentChunkId: chunk.id,
        status: "completed",
        message: "已从断点恢复",
      });
      continue;
    }

    let completed = false;
    let lastError = "未知错误";

    for (let attempt = 1; attempt <= cfg.maxAttemptsPerChunk; attempt++) {
      try {
        if (attempt > 1) {
          onChunk?.({
            done: index,
            total: chunks.length,
            newItems: 0,
            totalItems: allItems.length,
            currentChunkId: chunk.id,
            status: "retrying",
            message: `第 ${attempt}/${cfg.maxAttemptsPerChunk} 次尝试`,
          });
        }

        const response = await callLLM(buildChunkRequest(extracted, chunk, cfg.temperature), llmConfig, signal);
        const parsed = parseAlpacaResponse(response.rawContent);
        parseErrors.push(...parsed.parseErrors.map((message) => `${chunk.id}: ${message}`));

        if (!parsed.items.length && parsed.parseErrors.length) {
          throw new Error(parsed.parseErrors.join("；"));
        }

        let generated = parsed.items;
        if (response.finishReason === "length" && generated.length > 0) {
          const continuation = await callLLM(
            buildContinuationRequest(extracted, chunk, generated, cfg.temperature),
            llmConfig,
            signal
          );
          const continuationParsed = parseAlpacaResponse(continuation.rawContent);
          parseErrors.push(
            ...continuationParsed.parseErrors.map((message) => `${chunk.id} 续写: ${message}`)
          );
          generated = [...generated, ...continuationParsed.items];
        }

        const records = generated.map((item) => {
          const evidence = compactEvidence(chunk.text, item.output);
          return createQARecord(item, {
            documentId,
            fileName: extracted.sourceName,
            fileType: extracted.fileType,
            chunkId: chunk.id,
            heading: chunk.heading,
            startOffset: chunk.startOffset + evidence.start,
            endOffset: chunk.startOffset + evidence.end,
            text: evidence.text,
            available: evidence.localized,
          });
        });

        allItems.push(...records);
        completed = true;
        completedChunkIds.add(chunk.id);
        await onCheckpoint?.({
          completedChunkIds: [...completedChunkIds],
          items: allItems,
        });
        onChunk?.({
          done: index + 1,
          total: chunks.length,
          newItems: records.length,
          totalItems: allItems.length,
          currentChunkId: chunk.id,
          status: "completed",
        });
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (signal?.aborted) throw error;
        if (attempt < cfg.maxAttemptsPerChunk) await delay(350 * 2 ** (attempt - 1));
      }
    }

    if (!completed) {
      failures.push({
        chunkId: chunk.id,
        heading: chunk.heading,
        attempts: cfg.maxAttemptsPerChunk,
        message: lastError,
      });
      onChunk?.({
        done: index + 1,
        total: chunks.length,
        newItems: 0,
        totalItems: allItems.length,
        currentChunkId: chunk.id,
        status: "failed",
        message: lastError,
      });
    }
  }

  const deduplication = deduplicateQARecords(allItems, { threshold: cfg.dedupThreshold });
  onDedup?.({
    before: allItems.length,
    after: deduplication.items.length,
    removed: deduplication.removed,
  });

  return {
    items: deduplication.items,
    totalChunks: chunks.length,
    totalBeforeDedup: allItems.length,
    totalAfterDedup: deduplication.items.length,
    completedChunkIds: [...completedChunkIds],
    duplicateGroups: deduplication.groups,
    failures,
    parseErrors,
  };
}

function buildChunkRequest(
  extracted: ExtractedText,
  chunk: TextChunk,
  temperature: number
): LLMRequest {
  return {
    model: "",
    temperature,
    maxTokens: 16384,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `你是训练数据审核专家。把给定文档片段转换为准确、独立、可核验的问答数据。

仅输出 {"items":[{"instruction":"...","input":"","output":"..."}]}。

要求：
1. 每个答案都必须能被片段直接支持，不得使用片段外知识。
2. 问题脱离文档后仍应清楚，避免“文中、上述、该内容”等模糊指代。
3. 默认生成无需上下文即可回答的 closed-book 问答；只有阅读理解任务才把必要原文放入 input。
4. 保留数字、单位、条件、否定词、时间和适用范围。
5. 覆盖事实、定义、步骤、条件、因果、对比，但不要为了数量重复改写同一问题。
6. 回答完整简洁，不得使用“详见文档”“如上”等低信息表达。
7. 文档没有足够事实时返回空 items，不要编造。`,
      },
      {
        role: "user",
        content: `文档：${extracted.sourceName}\n片段：${chunk.index}/${chunk.total}\n章节：${chunk.heading || "未识别"}\n\n<source>\n${chunk.text}\n</source>`,
      },
    ],
  };
}

function buildContinuationRequest(
  extracted: ExtractedText,
  chunk: TextChunk,
  existing: AlpacaItem[],
  temperature: number
): LLMRequest {
  const existingQuestions = existing.slice(-80).map((item) => item.instruction);
  return {
    model: "",
    temperature,
    maxTokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "继续从同一片段提取尚未覆盖的问答。仅返回 JSON 对象；不得重复已有问题，不得补写被截断的无依据内容。",
      },
      {
        role: "user",
        content: `文档：${extracted.sourceName}\n章节：${chunk.heading || "未识别"}\n已有问题：\n${existingQuestions.join("\n")}\n\n<source>\n${chunk.text}\n</source>`,
      },
    ],
  };
}

function createDocumentId(extracted: ExtractedText): string {
  let hash = 2166136261;
  const value = `${extracted.sourceName}|${extracted.fileType}|${extracted.charCount}|${extracted.text.slice(0, 512)}`;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `doc_${(hash >>> 0).toString(36)}`;
}

function compactEvidence(text: string, answer: string, maxChars = 800): { text: string; start: number; end: number; localized: boolean } {
  if (text.length <= maxChars) return { text, start: 0, end: text.length, localized: true };
  const probes = answer
    .split(/[。！？.!?\n]/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 6)
    .sort((a, b) => b.length - a.length);
  let anchor = probes.map((probe) => text.indexOf(probe.slice(0, 80))).find((index) => index >= 0) ?? -1;
  if (anchor < 0) {
    const answerTokens = new Set(searchUnits(answer));
    let bestScore = 0;
    for (let windowStart = 0; windowStart < text.length; windowStart += 240) {
      const units = new Set(searchUnits(text.slice(windowStart, windowStart + maxChars)));
      const score = answerTokens.size
        ? [...answerTokens].filter((unit) => units.has(unit)).length / answerTokens.size
        : 0;
      if (score > bestScore) {
        bestScore = score;
        anchor = windowStart + Math.floor(maxChars / 2);
      }
    }
    if (bestScore < 0.12) return { text: "", start: 0, end: text.length, localized: false };
  }
  const start = Math.max(0, Math.min(text.length - maxChars, anchor - Math.floor(maxChars * 0.35)));
  const end = Math.min(text.length, start + maxChars);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return { text: `${prefix}${text.slice(start, end)}${suffix}`, start, end, localized: true };
}

function searchUnits(value: string): string[] {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
  if (normalized.length < 2) return normalized ? [normalized] : [];
  return [...new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)))];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
