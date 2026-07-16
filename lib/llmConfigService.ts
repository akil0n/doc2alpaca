// ============================================================
// LLMConfigService — LLM 厂商配置服务
//
// 职责：管理 LLM 厂商选择、模型列表、API Key 持久化，
//       配置保存在 LocalStorage 中
// 不负责：调用 LLM、构建 Prompt
// ============================================================

"use client";

/** 厂商定义 */
export interface VendorDef {
  /** 厂商标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** API Base URL */
  baseUrl: string;
  /** 该厂商最新的模型列表 */
  models: string[];
}

/** 用户保存的 LLM 配置 */
export interface LLMUserConfig {
  /** 选择的厂商 ID */
  vendorId: string;
  /** 选择的模型名称 */
  model: string;
  /** API Key */
  apiKey: string;
  /** Base URL（由厂商自动填充，也可手动改） */
  baseUrl: string;
}

const STORAGE_KEY = "doc2alpaca_llm_config";

// ===================== 厂商定义 =====================

export const VENDORS: VendorDef[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: [
      "gpt-5.5-instant",       // 当前默认旗舰，2026/5/28 更新，回复更自然、幻觉减少52.5%
      "gpt-5.5-thinking",      // 推理增强版
      "gpt-5.2",               // 顶级推理，5M 上下文，超快
      "gpt-5.1",               // 极致性能，2M 上下文
      "gpt-5",                 // AGI 级推理，2M 上下文
      "gpt-5-mini",            // 最佳性价比，128K 上下文
      "gpt-5-nano",            // 轻量低能耗，32K 上下文
      "o4-mini",               // 快速低成本推理
      "o3-pro",                // 最强推理（Pro 用户）
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    models: [
      "claude-opus-4-8",           // 旗舰，SWE-bench 88.6%，2026/5/28
      "claude-sonnet-4-6",         // 日驾驶，SWE-bench 79.6%，2026/2/17
      "claude-haiku-4-5-20251001", // 快速便宜，SWE-bench 73.3%
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: [
      "deepseek-v4",          // V4 Pro（超强推理，1.6T 参数 MoE）
      "deepseek-v4-flash",    // V4 Flash（速度优化版）
      "deepseek-chat",        // V3.2 通用对话（创意/编程/摘要，128K 上下文）
      "deepseek-reasoner",    // R2 推理模型（复杂逻辑/多步推理）
    ],
  },
  {
    id: "ollama",
    name: "Ollama（本地）",
    baseUrl: "http://localhost:11434/v1",
    models: [
      "qwen3:14b",               // 阿里千问3，14B，10-12GB VRAM，综合最佳
      "qwen3:8b",                // 千问3 8B，低配甜点
      "qwen3:32b",               // 千问3 32B，复杂任务
      "deepseek-r1:14b",         // 推理之王 14B，9GB 跑最强编程推理
      "deepseek-r1:7b",          // R1 7B，4.7GB 即可运行
      "deepseek-r1:32b",         // R1 32B，多步推理
      "deepseek-v3.2:671b",      // V3.2 MoE，671B 总参
      "llama4:scout",            // Meta Llama4，109B MoE，10M 超长上下文
      "qwen3:235b-a22b",         // 千问3 MoE 旗舰
    ],
  },
  {
    id: "zhipu",
    name: "智谱 AI (GLM)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      "glm-5.2",       // 最新旗舰，2026/6/17，1M 上下文，Code Arena 全球可用模型第一
      "glm-5.1",       // 前代旗舰，SWE-Bench Pro SOTA，可自主执行 8h 工程任务
      "glm-5",         // 开源 SOTA，Agent 工程
      "glm-4-plus",    // 成熟稳定版
      "glm-4-air",     // 轻量高性价比
      "glm-4-flash",   // 快速低延迟
    ],
  },
  {
    id: "baidu",
    name: "百度千帆",
    baseUrl: "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat",
    models: [
      "ernie-5.1",              // 最新旗舰，2026/5/9，全球第4中国第1，预训练成本6%
      "ernie-5.0",              // 2.4万亿参数全模态，超 GPT-5-High
      "ernie-4.5-turbo-128k",   // 128K 超长上下文，极致性价比
      "ERNIE-4.0-8K",           // 成熟稳定版
      "ERNIE-Speed-8K",         // 快速低成本
    ],
  },
  {
    id: "aliyun",
    name: "阿里通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      "qwen-max",            // Qwen3.7-Max，2026/5/20，国产第一，35h 自治执行
      "qwen-plus",           // Qwen3.7-Plus，多模态均衡版
      "qwen-turbo",          // Qwen3.7-Flash，轻量快速版
    ],
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [
      "deepseek-ai/DeepSeek-V4-Flash",              // V4 Flash，1M 上下文
      "MiniMaxAI/MiniMax-M3",                       // 编码超 GPT-5.5，1M 上下文
      "zai-org/GLM-5.1",                           // 长时程 Agent
      "Qwen/Qwen3-Coder-480B-A35B-Instruct",         // 代码自动补全首选
      "deepseek-ai/DeepSeek-V3.2",                  // 通用对话 V3.2
      "stepfun-ai/Step-3.5-Flash",                  // 深度推理 + 闪电速度
    ],
  },
];

// ===================== 服务方法 =====================

/**
 * 获取厂商列表
 */
export function getVendors(): VendorDef[] {
  return VENDORS;
}

/**
 * 根据厂商 ID 获取厂商定义
 */
export function getVendorById(id: string): VendorDef | undefined {
  return VENDORS.find((v) => v.id === id);
}

/**
 * 获取保存的用户配置
 */
export function getSavedConfig(): LLMUserConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 保存用户配置到 LocalStorage
 */
export function saveConfig(config: LLMUserConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 静默处理
  }
}

/**
 * 清空用户配置
 */
export function clearConfig(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 静默处理
  }
}

/**
 * 获取有效的 LLM 调用配置
 *
 * 优先级：LocalStorage 配置 > 环境变量兜底
 * 返回 { apiKey, baseUrl, model }
 */
export function getEffectiveConfig(): {
  apiKey: string;
  baseUrl: string;
  model: string;
} {
  // 先查 LocalStorage
  const saved = getSavedConfig();
  if (saved?.apiKey && !saved.apiKey.startsWith("your-")) {
    return {
      apiKey: saved.apiKey,
      baseUrl: saved.baseUrl,
      model: saved.model,
    };
  }

  // 兜底：环境变量
  return {
    apiKey: process.env.NEXT_PUBLIC_LLM_API_KEY || process.env.LLM_API_KEY || "",
    baseUrl:
      process.env.NEXT_PUBLIC_LLM_BASE_URL ||
      process.env.LLM_BASE_URL ||
      "https://api.openai.com/v1",
    model:
      process.env.NEXT_PUBLIC_LLM_MODEL || process.env.LLM_MODEL || "gpt-4o",
  };
}

/**
 * 检查是否已配置有效的 API Key
 */
export function isConfigured(): boolean {
  const cfg = getEffectiveConfig();
  return (
    cfg.apiKey.length > 0 &&
    !cfg.apiKey.startsWith("your-") &&
    !cfg.apiKey.startsWith("sk-your")
  );
}
