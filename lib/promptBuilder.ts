// ============================================================
// PromptBuilder — Prompt 构建器
//
// 职责：将提取的文档文本构建为适合 LLM 解析的 messages，
//       支持通过 systemPrompt 自定义指令
// 不负责：调用 LLM、解析 LLM 输出
// ============================================================

import type { ExtractedText, LLMRequest, ChatCompletionMessage } from "@/types";

// ============================================================
// 公共接口
// ============================================================

/**
 * 构建 Alpaca 转换的 LLM 请求
 *
 * @param extractedText 从文档中提取的文本内容
 * @param systemPrompt 自定义 System Prompt（可选，默认使用通用模板）
 * @returns 构造好的 LLM 调用请求
 */
export function buildAlpacaPrompt(
  extractedText: ExtractedText,
  systemPrompt?: string
): LLMRequest {
  const prompt: string = systemPrompt || getDefaultSystemPrompt();

  const messages: ChatCompletionMessage[] = [
    { role: "system", content: prompt },
    {
      role: "user",
      content: buildUserPrompt(extractedText),
    },
  ];

  return {
    model: "",
    messages,
    temperature: 0.3,
    response_format: { type: "json_object" },
  };
}

// ============================================================
// 内部实现
// ============================================================

/**
 * 默认 system prompt（与 templateService 中 default 模板保持一致）
 */
function getDefaultSystemPrompt(): string {
  return `你是一个专业的 AI 训练数据生成助手。

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
}

/**
 * 构建 user prompt
 *
 * 在文档文本前加一段说明，帮助 LLM 理解上下文。
 * 如果文本过长（超过 80000 字符），自动截断并提示。
 */
function buildUserPrompt(extracted: ExtractedText): string {
  const maxLen = 80000;
  let text = extracted.text;

  let prefix = `请根据以下 ${formatFileType(extracted.fileType)} 内容生成 Alpaca 格式的数据集。\n\n`;
  prefix += `文档名称：${extracted.sourceName}\n`;
  prefix += `文档类型：${formatFileType(extracted.fileType)}\n`;
  prefix += `文档字数：约 ${extracted.charCount} 字\n\n`;
  prefix += `===== 文档内容开始 =====\n\n`;

  const suffix = `\n\n===== 文档内容结束 =====\n\n请基于以上内容生成 Alpaca 格式的 JSON 数据集。`;

  if (text.length > maxLen) {
    text = text.slice(0, maxLen);
    prefix += `（文档较长，已截取前 ${maxLen} 字符，如需完整内容请分段处理）\n\n`;
  }

  return prefix + text + suffix;
}

/**
 * 将 fileType 转为中文描述
 */
function formatFileType(type: string): string {
  const map: Record<string, string> = {
    pdf: "PDF 文档",
    docx: "Word 文档",
    pptx: "PowerPoint 演示文稿",
    txt: "纯文本文档",
    md: "Markdown 文档",
    html: "HTML 文档",
  };
  return map[type] || type;
}
