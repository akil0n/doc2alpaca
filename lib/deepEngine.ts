// ============================================================
// DeepEngine — 深度提取引擎
//
// 职责：对同一文档进行多轮 LLM 调用，直到内容被充分提取。
//       支持断点续传、去重、相似度终止。
//
// 终止条件：
//   1. 达到最大轮数
//   2. LLM 返回空结果（无新数据）
//   3. LLM finish_reason === "stop"（自然结束，未触达上限）
//   4. 新生成内容与已有数据高度相似（同质化终止）
// ============================================================

import type { ExtractedText, AlpacaItem, DeepRoundResult, DeepEngineConfig, SessionMeta, LLMRequest } from "@/types";
import { callLLM } from "@/lib/aiClient";
import { parseAlpacaResponse } from "@/lib/resultParser";
import { appendRound, createSession, updateSession, loadProgress } from "@/lib/sessionManager";
import type { LLMCallConfig } from "@/lib/aiClient";

/** 引擎轮次回调 — 用于 SSE 推送进度 */
export interface RoundCallback {
  (event: { round: number; newItems: number; totalItems: number; finishReason: "stop" | "length" | null }): void;
}

/**
 * 执行深度提取
 *
 * @param extracted 文档提取文本
 * @param session 会话 meta（新建或已存在的）
 * @param llmConfig LLM 调用配置
 * @param onRound 每轮完成回调（可选，用于 SSE）
 * @returns 最终统计
 */
export async function runDeepAnalysis(
  extracted: ExtractedText,
  session: SessionMeta,
  llmConfig?: LLMCallConfig,
  onRound?: RoundCallback,
  signal?: AbortSignal
): Promise<{ totalItems: number; totalRounds: number; items: AlpacaItem[] }> {
  const config = session.config;
  const allItems: AlpacaItem[] = [];
  let roundsDone = 0;

  // ---- 恢复已有进度 ----
  const [existingRounds, _truncated] = await loadProgress(session.sessionId);
  for (const r of existingRounds) {
    allItems.push(...r.items);
    roundsDone++;
  }

  // ---- 主循环 ----
  for (let round = roundsDone + 1; round <= config.maxRounds; round++) {
    // 构建本轮 prompt
    const prompt = buildDeepPrompt(extracted, allItems, round);

    // 调用 LLM
    const llmResponse = await callLLM(prompt, llmConfig, signal);
    const finishReason = llmResponse.finishReason;

    // 解析结果
    const parsed = parseAlpacaResponse(llmResponse.rawContent);
    let newItems = parsed.items.filter((item) => item.instruction.trim().length > 0);

    // 去重：过滤掉与已有数据高度相似的
    if (allItems.length > 0) {
      newItems = deduplicateItems(newItems, allItems, config.similarityThreshold);
    }

    // 构造本轮结果
    const roundResult: DeepRoundResult = {
      round,
      items: newItems,
      validCount: newItems.length,
      finishReason,
      tokenUsage: llmResponse.usage,
      timestamp: Date.now(),
    };

    // 写入进度文件
    await appendRound(session.sessionId, roundResult);
    allItems.push(...newItems);

    // 更新会话 meta
    await updateSession(session.sessionId, {
      stats: {
        totalRounds: round,
        totalItems: allItems.length,
        lastFinishReason: finishReason,
      },
    });

    // 回调通知（SSE）
    onRound?.({
      round,
      newItems: newItems.length,
      totalItems: allItems.length,
      finishReason,
    });

    // ---- 终止条件判断 ----

    // 条件 1: LLM 没有返回任何新数据 → 内容已榨干
    if (newItems.length === 0) {
      await updateSession(session.sessionId, { status: "completed" });
      return { totalItems: allItems.length, totalRounds: round, items: allItems };
    }

    // 条件 2: LLM 自然结束（未触达 max_tokens）→ 本轮已涵盖全部内容
    if (finishReason === "stop") {
      await updateSession(session.sessionId, { status: "completed" });
      return { totalItems: allItems.length, totalRounds: round, items: allItems };
    }

    // 条件 3: 同质化检测 — 最新两轮内容太相似 → 再生成也是重复
    if (round > 1) {
      const prevRound = existingRounds[round - 2] || roundResult;
      if (prevRound.items.length > 0 && newItems.length > 0) {
        const avgSim = averageSimilarity(newItems, prevRound.items);
        if (avgSim > config.similarityThreshold) {
          await updateSession(session.sessionId, { status: "completed" });
          return { totalItems: allItems.length, totalRounds: round, items: allItems };
        }
      }
    }
  }

  // 达到最大轮数
  await updateSession(session.sessionId, { status: "completed" });
  return { totalItems: allItems.length, totalRounds: config.maxRounds, items: allItems };
}

// ============================================================
// Prompt 构建
// ============================================================

/**
 * 构建深度提取的 LLM 请求
 *
 * 第 1 轮与原来一致；第 2 轮起添加续接上下文。
 */
function buildDeepPrompt(
  extracted: ExtractedText,
  existingItems: AlpacaItem[],
  round: number
): LLMRequest {
  if (round === 1) {
    // 第 1 轮：使用标准 prompt，但去掉数量限制
    return buildFullPrompt(extracted);
  }

  // 第 2 轮起：已生成 N 条，要求继续提取不同内容
  return buildContinuePrompt(extracted, existingItems.length, round);
}

/**
 * 首轮完整提取 prompt（去掉数量限制版本）
 */
function buildFullPrompt(extracted: ExtractedText): LLMRequest {
  const systemPrompt = `你是一个专业的 AI 训练数据生成助手。

你的任务是将用户提供的文档内容，转换成高质量的 Alpaca 格式微调数据集。

## 输出格式要求

你必须返回一个 JSON 对象，格式如下：
{
  "items": [
    {
      "instruction": "指令 — 告诉模型要完成什么任务",
      "input": "输入 — 给模型的上下文或数据（无输入时填空字符串 ""）",
      "output": "输出 — 期望的正确回答或处理结果"
    }
  ]
}

## 数据生成规则

1. 每一条数据必须基于文档中的真实内容，不要编造文档中没有的信息。
2. instruction 应覆盖多种任务类型：总结、提取、分析、对比、问答、改写等。
3. input 可以从文档中提取具体段落、数据、案例作为上下文。
4. output 要准确、完整，基于文档内容给出回答。
5. 每条 instruction 不能过于相似，要有区分度。
6. 根据文档内容的丰富程度生成尽可能多的数据，不设上限。
7. 所有字段使用中文（除非文档本身是英文）。
8. 注意：output 要具体有信息量，不要写成 "详见文档" 这样无意义的回答。

请直接输出 JSON，不要包含 \`\`\`json 等标记，不要额外说明。`;

  const maxLen = 80000;
  let text = extracted.text;
  const fileTypeMap: Record<string, string> = {
    pdf: "PDF 文档", docx: "Word 文档", pptx: "PowerPoint 演示文稿",
    txt: "纯文本文档",
    md: "Markdown 文档", html: "HTML 文档",
  };

  let prefix = `请根据以下 ${fileTypeMap[extracted.fileType] || extracted.fileType} 内容生成 Alpaca 格式的数据集。\n\n`;
  prefix += `文档名称：${extracted.sourceName}\n`;
  prefix += `文档类型：${fileTypeMap[extracted.fileType] || extracted.fileType}\n`;
  prefix += `文档字数：约 ${extracted.charCount} 字\n\n`;
  prefix += `===== 文档内容开始 =====\n\n`;

  const suffix = `\n\n===== 文档内容结束 =====\n\n请基于以上内容生成 Alpaca 格式的 JSON 数据集。`;

  if (text.length > maxLen) {
    text = text.slice(0, maxLen);
    prefix += `（文档较长，已截取前 ${maxLen} 字符，如需完整内容请分段处理）\n\n`;
  }

  return {
    model: "",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prefix + text + suffix },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  };
}

/**
 * 续接轮次 prompt
 *
 * 告知 LLM 已生成多少条，要求继续提取不同内容，避免重复。
 */
function buildContinuePrompt(
  extracted: ExtractedText,
  existingCount: number,
  round: number
): LLMRequest {
  const fileTypeMap: Record<string, string> = {
    pdf: "PDF 文档", docx: "Word 文档", pptx: "PowerPoint 演示文稿",
    txt: "纯文本文档",
    md: "Markdown 文档", html: "HTML 文档",
  };

  const systemPrompt = `你是一个专业的 AI 训练数据生成助手。

## 任务说明

你之前已经基于同一文档生成了 ${existingCount} 条 Alpaca 数据。
现在是第 ${round} 轮提取，请从文档中提取**更多不同角度、不同内容**的数据。

## 要求

1. 新生成的数据必须与已有数据有明显区分度，不要重复。
2. 你可以考虑：文档中尚未被提取的段落、不同的分析角度、遗漏的细节等。
3. 每一条数据必须基于文档中的真实内容。
4. output 要具体有信息量。

## 输出格式

{
  "items": [
    {
      "instruction": "指令",
      "input": "输入（无输入则为空字符串）",
      "output": "输出"
    }
  ]
}

请直接输出 JSON，不要附加说明。`;

  const maxLen = 80000;
  let text = extracted.text;
  const fileType = fileTypeMap[extracted.fileType] || extracted.fileType;

  const userContent = `请继续从以下文档中提取新的 Alpaca 数据。
你已生成了 ${existingCount} 条，现在需要更多不同内容的数据。

文档名称：${extracted.sourceName}
文档类型：${fileType}
当前轮次：第 ${round} 轮

===== 文档内容 =====

${text.length > maxLen ? text.slice(0, maxLen) + `\n\n（文档较长，已截取前 ${maxLen} 字符）` : text}

===== 文档内容结束 =====

请生成更多不同内容的 Alpaca 数据。`;

  return {
    model: "",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  };
}

// ============================================================
// 去重与相似度工具
// ============================================================

/**
 * 从新数据中过滤掉与已有数据高度相似的条目
 */
function deduplicateItems(
  newItems: AlpacaItem[],
  existingItems: AlpacaItem[],
  threshold: number
): AlpacaItem[] {
  return newItems.filter((item) => {
    const sim = maxSimilarity(item, existingItems);
    return sim < threshold;
  });
}

/**
 * 计算一条数据与已有数据集合的最大相似度
 */
function maxSimilarity(item: AlpacaItem, existing: AlpacaItem[]): number {
  let max = 0;
  const instNorm = normalize(item.instruction);
  for (const ex of existing) {
    const exNorm = normalize(ex.instruction);
    const sim = jaccardSimilarity(instNorm, exNorm);
    if (sim > max) max = sim;
    if (max > 0.95) break; // 提前终止
  }
  return max;
}

/**
 * 计算两组数据之间的平均相似度（用于同质化终止判定）
 */
function averageSimilarity(newItems: AlpacaItem[], prevItems: AlpacaItem[]): number {
  if (newItems.length === 0 || prevItems.length === 0) return 0;

  let totalSim = 0;
  let count = 0;

  for (const n of newItems) {
    for (const p of prevItems) {
      totalSim += jaccardSimilarity(normalize(n.instruction), normalize(p.instruction));
      count++;
    }
  }

  return count > 0 ? totalSim / count : 0;
}

/**
 * 标准化文本：去标点、转小写、去空白
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w一-鿿]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Jaccard 相似度（基于字符 3-gram 集合）
 *
 * 对中文效果较好，比全字符集合更敏感。
 */
function jaccardSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set<string>();
  const setB = new Set<string>();

  for (let i = 0; i < a.length - 2; i++) setA.add(a.slice(i, i + 3));
  for (let i = 0; i < b.length - 2; i++) setB.add(b.slice(i, i + 3));

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}
