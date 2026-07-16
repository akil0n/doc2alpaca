// ============================================================
// FullExtractEngine — 分块全覆盖提取引擎
//
// 职责：将文档分块后，每块独立调用 LLM 穷尽提取，
//       最终全局去重，获得完整 QA 数据集
// 不负责：API 路由、SSE 推送、文件管理
// ============================================================

import type { ExtractedText, AlpacaItem, TextChunk, LLMRequest } from "@/types";
import { chunkDocument } from "@/lib/chunker";
import { callLLM, type LLMCallConfig } from "@/lib/aiClient";
import { parseAlpacaResponse } from "@/lib/resultParser";
import { deduplicateItems } from "@/lib/dedupService";

/** 块级进度回调 — 用于 SSE 推送 */
export interface ChunkCallback {
  (event: {
    done: number;
    total: number;
    newItems: number;
    totalItems: number;
    currentChunkId: string;
  }): void;
}

/** 去重进度回调 */
export interface DedupCallback {
  (event: { before: number; after: number; removed: number }): void;
}

/** 全覆盖提取配置 */
export interface FullExtractConfig {
  /** 每块最大字符数（默认 6000） */
  maxCharsPerChunk?: number;
  /** 块间重叠字符数（默认 200） */
  chunkOverlap?: number;
  /** LLM 每块最大输出 tokens（默认 16384） */
  maxTokensPerChunk?: number;
  /** 全局去重阈值（默认 0.88） */
  dedupThreshold?: number;
  /** LLM 温度（默认 0.3） */
  temperature?: number;
}

const DEFAULT_CONFIG: Required<FullExtractConfig> = {
  maxCharsPerChunk: 6000,
  chunkOverlap: 200,
  maxTokensPerChunk: 16384,
  dedupThreshold: 0.88,
  temperature: 0.3,
};

/**
 * 执行全覆盖提取
 *
 * @param extracted 文档提取文本
 * @param llmConfig LLM 调用配置
 * @param config 全覆盖提取配置（可选）
 * @param onChunk 每块完成回调（可选，用于 SSE）
 * @param onDedup 去重完成回调（可选）
 * @returns 最终提取结果
 */
export async function runFullExtraction(
  extracted: ExtractedText,
  llmConfig?: LLMCallConfig,
  config?: FullExtractConfig,
  onChunk?: ChunkCallback,
  onDedup?: DedupCallback
): Promise<{
  items: AlpacaItem[];
  totalChunks: number;
  totalBeforeDedup: number;
  totalAfterDedup: number;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // ---- Step 1: 分块 ----
  const chunks = chunkDocument(extracted.text, cfg.maxCharsPerChunk, cfg.chunkOverlap);

  if (chunks.length === 0) {
    return { items: [], totalChunks: 0, totalBeforeDedup: 0, totalAfterDedup: 0 };
  }

  // ---- Step 2: 逐块提取 ----
  const allItems: AlpacaItem[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // 构建块级提取 prompt
    const prompt = buildChunkPrompt(extracted, chunk, chunks.length);

    // 调用 LLM
    const llmResponse = await callLLM(
      {
        model: "",
        messages: [
          { role: "system", content: prompt.systemPrompt },
          { role: "user", content: prompt.userPrompt },
        ],
        temperature: cfg.temperature,
        response_format: { type: "json_object" },
      },
      llmConfig
    );

    // 解析结果
    const parsed = parseAlpacaResponse(llmResponse.rawContent);
    const newItems = parsed.items.filter(
      (item) => item.instruction.trim().length > 0
    );

    allItems.push(...newItems);

    // 回调通知
    onChunk?.({
      done: i + 1,
      total: chunks.length,
      newItems: newItems.length,
      totalItems: allItems.length,
      currentChunkId: chunk.id,
    });
  }

  const totalBeforeDedup = allItems.length;

  // ---- Step 3: 全局去重 ----
  const { items: deduped, removed } = deduplicateItems(allItems, cfg.dedupThreshold);

  onDedup?.({
    before: totalBeforeDedup,
    after: deduped.length,
    removed,
  });

  return {
    items: deduped,
    totalChunks: chunks.length,
    totalBeforeDedup,
    totalAfterDedup: deduped.length,
  };
}

// ============================================================
// Prompt 构建
// ============================================================

/**
 * 构建块级穷尽提取的 system prompt 和 user prompt
 *
 * 关键设计决策：不要求"再生成点不同的"，
 * 而是要求"穷尽该片段所有可成问答的知识点，一条不落"
 */
function buildChunkPrompt(
  extracted: ExtractedText,
  chunk: TextChunk,
  totalChunks: number
): { systemPrompt: string; userPrompt: string } {
  const fileTypeMap: Record<string, string> = {
    pdf: "PDF 文档", docx: "Word 文档", pptx: "PowerPoint 演示文稿",
    txt: "纯文本文档",
    md: "Markdown 文档", html: "HTML 文档",
  };

  const systemPrompt = `你是一个专业的数据集构建专家。

你的任务是从文档片段中提取**所有**可以作为指令-回答对（QA pair）的知识点。

## 输出格式

{
  "items": [
    {
      "instruction": "指令 — 自然语言问题或任务描述",
      "input": "输入 — 给模型的上下文/数据（无输入时填空字符串 ""）",
      "output": "输出 — 基于文本的准确回答"
    }
  ]
}

## 核心要求

1. 【穷尽提取】必须覆盖该片段中的每一个信息点，不要遗漏。
2. 【基于事实】每一条必须基于文档中的真实内容，严禁编造。
3. 【指令多样】覆盖：事实问答、概念解释、流程说明、对比分析、数据列举、原因分析等。
4. 【回答完整】output 要具体、有信息量，不要写"详见文档"。
5. 【粒度适中】列表中的每一项、对比中的每一个维度、步骤中的每一步，都可以拆为独立问答。
6. 【语言】使用中文（除非文档片段本身是英文）。
7. 【数量】能提取多少就提取多少，不设上限。

请直接输出 JSON，不要包含 \`\`\`json 等标记，不要额外说明。`;

  const userPrompt = `请穷尽提取以下文档片段中的所有指令-回答对。

文档名称：${extracted.sourceName}
文档类型：${fileTypeMap[extracted.fileType] || extracted.fileType}
文档总字数：约 ${extracted.charCount} 字
当前片段：第 ${chunk.index}/${totalChunks} 块
${chunk.heading ? `章节标题：${chunk.heading}` : ""}

===== 文档片段开始 =====

${chunk.text}

===== 文档片段结束 =====

请列出该片段中所有可作为指令-回答对的知识点，一条不落。`;

  return { systemPrompt, userPrompt };
}
