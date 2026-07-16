// ============================================================
// TemplateService — Prompt 模板管理服务
//
// 职责：管理内置和用户自定义的 Instruction 模板，
//       支持增删改查，持久化到 LocalStorage
// 不负责：构建 LLM 请求、调用 LLM
// ============================================================

"use client";

import type { PromptTemplate } from "@/types";

const STORAGE_KEY = "doc2alpaca_templates";
const CUSTOM_PREFIX = "custom_";

// ===================== 内置默认模板 =====================

const BUILTIN_TEMPLATES: PromptTemplate[] = [
  {
    id: "default",
    name: "通用文档解析",
    description: "将文档内容转换成 Alpaca 格式的微调数据集，覆盖总结、提取、分析、问答等多种任务类型",
    systemPrompt: `你是一个专业的 AI 训练数据生成助手。

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

请直接输出 JSON，不要包含 \`\`\`json 等标记，不要额外说明。`,
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: "qa",
    name: "问答对生成",
    description: "基于文档内容生成问答对，每条数据是一个问题和对应的答案",
    systemPrompt: `你是一个 AI 训练数据生成助手，专注于生成问答对数据。

你的任务是根据用户提供的文档内容，生成高质量的问答对（Q&A pairs）形式的 Alpaca 数据集。

## 输出格式

{
  "items": [
    {
      "instruction": "请回答以下问题：",
      "input": "具体问题，基于文档内容",
      "output": "完整准确的回答"
    }
  ]
}

## 规则

1. 每个问题必须基于文档中的具体信息。
2. 问题类型要多样：事实性问题、解释性问题、对比性问题、应用性问题。
3. 问题要具体，不要问过于宽泛的问题。
4. 答案要基于文档内容，准确完整。
5. 根据文档内容生成尽可能多的问答对，不设上限。
6. 使用中文。`,
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: "summary",
    name: "摘要提取",
    description: "生成文档的摘要/总结类数据，适合训练模型的总结能力",
    systemPrompt: `你是一个 AI 训练数据生成助手，专注于生成摘要总结类数据。

根据用户提供的文档内容，生成 Alpaca 格式的摘要数据集。

## 输出格式

{
  "items": [
    {
      "instruction": "总结以下内容的核心观点：",
      "input": "需要总结的具体段落",
      "output": "简洁准确的摘要"
    }
  ]
}

## 规则

1. 每个 instruction 要求对文档的不同部分或角度进行总结。
2. 摘要长度要适中，保留关键信息。
3. 覆盖多种总结类型：段落总结、全文总结、分点总结、一句话总结。
4. 根据文档内容生成尽可能多的数据，不设上限。
5. 使用中文。`,
    isBuiltin: true,
    createdAt: 0,
  },
  {
    id: "extraction",
    name: "信息抽取",
    description: "从文档中抽取关键信息、实体、数据，适合训练信息提取能力",
    systemPrompt: `你是一个 AI 训练数据生成助手，专注于信息抽取任务。

根据用户提供的文档内容，生成 Alpaca 格式的信息抽取数据集。

## 输出格式

{
  "items": [
    {
      "instruction": "从以下文本中提取 [具体信息类型]：",
      "input": "包含目标信息的文本段落",
      "output": "提取到的结构化信息"
    }
  ]
}

## 规则

1. 覆盖多种信息类型：关键数据、人物/组织、时间事件、技术参数、分类标签。
2. 抽取目标要明确，不能模糊。
3. output 要结构化、清晰。
4. 根据文档内容生成尽可能多的数据，不设上限。
5. 使用中文。`,
    isBuiltin: true,
    createdAt: 0,
  },
];

// ===================== 服务方法 =====================

/**
 * 获取所有模板（内置 + 自定义）
 */
export function getAllTemplates(): PromptTemplate[] {
  const builtins = [...BUILTIN_TEMPLATES];
  const customs = loadCustomTemplates();
  return [...builtins, ...customs];
}

/**
 * 根据 id 获取模板
 */
export function getTemplateById(id: string): PromptTemplate | undefined {
  return getAllTemplates().find((t) => t.id === id);
}

/**
 * 创建自定义模板
 */
export function createTemplate(
  name: string,
  description: string,
  systemPrompt: string
): PromptTemplate {
  const customs = loadCustomTemplates();
  const id = `${CUSTOM_PREFIX}${Date.now()}`;
  const template: PromptTemplate = {
    id,
    name,
    description,
    systemPrompt,
    isBuiltin: false,
    createdAt: Date.now(),
  };
  customs.push(template);
  saveCustomTemplates(customs);
  return template;
}

/**
 * 更新自定义模板
 */
export function updateTemplate(
  id: string,
  data: { name?: string; description?: string; systemPrompt?: string }
): boolean {
  const customs = loadCustomTemplates();
  const idx = customs.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  Object.assign(customs[idx], data);
  saveCustomTemplates(customs);
  return true;
}

/**
 * 删除自定义模板
 */
export function deleteTemplate(id: string): boolean {
  const customs = loadCustomTemplates();
  const filtered = customs.filter((t) => t.id !== id);
  if (filtered.length === customs.length) return false;
  saveCustomTemplates(filtered);
  return true;
}

// ===================== 内部存储方法 =====================

function loadCustomTemplates(): PromptTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: PromptTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // LocalStorage 写入失败静默处理
  }
}
