// ============================================================
// ResultParser — LLM 输出解析器
//
// 职责：解析 LLM 返回的原始文本成结构化的 Alpaca 数据集，
//       校验字段完整性，处理常见格式异常
// 不负责：调用 LLM、构建 prompt、保存数据
// ============================================================

import type { AlpacaItem, AlpacaDatasetParsed } from "@/types";

/**
 * 解析 LLM 返回的 Alpaca JSON 数据
 *
 * 尝试多种策略从 LLM 原始输出中提取结构化 Alpaca 数据，
 * 校验每条数据的字段完整性，返回解析结果。
 *
 * @param rawContent LLM 返回的原始文本
 * @returns 解析后的数据集（含校验统计和错误信息）
 */
export function parseAlpacaResponse(rawContent: string): AlpacaDatasetParsed {
  const errors: string[] = [];
  let items: AlpacaItem[] = [];

  if (!rawContent || rawContent.trim().length === 0) {
    return {
      items: [],
      totalCount: 0,
      validCount: 0,
      parseErrors: ["LLM 返回了空内容，无法解析。"],
    };
  }

  try {
    // 策略 1：直接尝试解析为 JSON
    const parsed = tryParseJSON(rawContent);
    if (parsed) {
      items = extractItemsFromParsed(parsed, errors);
    } else {
      // 策略 2：从 Markdown 代码块中提取 JSON
      const jsonBlock = extractJsonFromCodeBlock(rawContent);
      if (jsonBlock) {
        const blockParsed = tryParseJSON(jsonBlock);
        if (blockParsed) {
          items = extractItemsFromParsed(blockParsed, errors);
        } else {
          errors.push("从代码块中提取到的内容不是有效 JSON。");
        }
      } else {
        // 策略 3：尝试修复常见 JSON 格式问题后重新解析
        const repaired = repairPartialJson(rawContent);
        const repairedParsed = tryParseJSON(repaired);
        if (repairedParsed) {
          items = extractItemsFromParsed(repairedParsed, errors);
          errors.push("已自动修复 LLM 输出的格式问题。");
        } else {
          errors.push("无法解析 LLM 输出：不是有效的 JSON 格式。");
        }
      }
    }
  } catch (err) {
    errors.push(
      `解析过程出错：${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 校验每条数据的字段完整性
  const validatedItems = items.filter((item, index) => {
    if (!validateAlpacaItem(item)) {
      errors.push(`第 ${index + 1} 条数据缺少必要字段，已跳过。`);
      return false;
    }
    return true;
  });

  return {
    items: validatedItems,
    totalCount: items.length,
    validCount: validatedItems.length,
    parseErrors: errors,
  };
}

/**
 * 校验单条 Alpaca 数据是否有效
 *
 * 必须包含 instruction 和 output 字段（input 可以为空字符串）。
 *
 * @param item 待校验的数据项
 * @returns 是否有效
 */
export function validateAlpacaItem(item: unknown): item is AlpacaItem {
  if (!item || typeof item !== "object") return false;

  const candidate = item as Record<string, unknown>;

  return (
    typeof candidate.instruction === "string" &&
    candidate.instruction.trim().length > 0 &&
    typeof candidate.output === "string" &&
    candidate.output.trim().length > 0 &&
    (candidate.input === undefined ||
      typeof candidate.input === "string")
  );
}

/**
 * 尝试修复常见的 JSON 格式问题
 *
 * 处理：多余逗号、缺少引号、单引号代替双引号、
 *       末尾多余字符、JSON 前后有多余文本等。
 *
 * @param text 原始文本
 * @returns 修复后的文本
 */
export function repairPartialJson(text: string): string {
  let repaired = text.trim();

  // 尝试提取第一个 { 到最后一个 } 之间的内容
  const firstBrace = repaired.indexOf("{");
  const lastBrace = repaired.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    repaired = repaired.slice(firstBrace, lastBrace + 1);
  }

  // 将单引号替换为双引号（只在 JSON 上下文中安全）
  // 注意：这会破坏字符串内部的单引号内容，但对 LLM 输出通常是安全的
  repaired = repaired.replace(/'/g, '"');

  // 修复多余的逗号（在 } 或 ] 前）
  repaired = repaired.replace(/,\s*}/g, "}");
  repaired = repaired.replace(/,\s*\]/g, "]");

  // 修复缺少引号的 key（如 {name: "value"} -> {"name": "value"}）
  repaired = repaired.replace(
    /([{,]\s*)(\w+)(\s*:)/g,
    '$1"$2"$3'
  );

  return repaired;
}

// ============================================================
// 内部工具函数
// ============================================================

/**
 * 尝试将字符串解析为 JSON
 *
 * 返回解析后的对象，失败返回 null。
 */
function tryParseJSON(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 从 Markdown 代码块中提取 JSON 内容
 *
 * 匹配 ```json ... ```、``` ... ``` 以及内联 JSON。
 */
function extractJsonFromCodeBlock(text: string): string | null {
  // 匹配 ```json 或 ``` 代码块
  const blockRegex = /```(?:json)?\s*([\s\S]*?)```/;
  const match = text.match(blockRegex);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }
  return null;
}

/**
 * 从已解析的 JSON 对象中提取 Alpaca 条目
 *
 * 支持多种可能的 JSON 结构：
 * - { items: [...] }
 * - { data: [...] }
 * - [...] 直接是数组
 * - { alpaca_data: [...] }
 */
function extractItemsFromParsed(
  parsed: unknown,
  errors: string[]
): AlpacaItem[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    // 按常见字段名优先级搜索
    for (const key of ["items", "data", "alpaca_data", "alpacaData", "dataset", "records"]) {
      if (Array.isArray(obj[key])) {
        return obj[key];
      }
    }

    // 如果对象本身包含 instruction 字段，可能是单条数据
    if (typeof obj.instruction === "string") {
      return [obj as unknown as AlpacaItem];
    }

    errors.push(
      "JSON 中未找到数据集数组（期望字段名：items / data / alpaca_data）。"
    );
  }

  return [];
}
