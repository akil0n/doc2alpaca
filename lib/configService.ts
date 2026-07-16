// ============================================================
// ConfigService — 应用配置服务
//
// 职责：从环境变量读取 LLM 配置，提供统一的配置查询接口
// 不负责：运行时修改配置、管理用户设置、调用 LLM
// ============================================================

import type { AppConfig, ModelProvider } from "@/types";

/** 环境变量 key 常量 */
const ENV_KEYS = {
  API_KEY: "LLM_API_KEY",
  BASE_URL: "LLM_BASE_URL",
  MODEL: "LLM_MODEL",
} as const;

/** 各供应商默认的 API Base URL */
const DEFAULT_BASE_URLS: Record<Exclude<ModelProvider, "custom">, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  ollama: "http://localhost:11434/v1",
};

/**
 * 读取单个环境变量（兼容 Next.js 服务端环境变量）
 */
function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * 获取应用配置
 *
 * 从 process.env 读取 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL，
 * 返回结构化的 AppConfig 对象。
 */
export function getConfig(): AppConfig {
  const apiKey = getEnv(ENV_KEYS.API_KEY) || "";
  const baseUrl = getEnv(ENV_KEYS.BASE_URL) || DEFAULT_BASE_URLS.openai;
  const model = getEnv(ENV_KEYS.MODEL) || "gpt-4o";

  // 根据 baseUrl 推断 provider（开放推理，仅用于展示）
  let provider: ModelProvider = "openai";
  if (baseUrl.includes("anthropic")) provider = "anthropic";
  else if (baseUrl.includes("11434") || baseUrl.includes("ollama"))
    provider = "ollama";
  else if (
    !baseUrl.includes("openai") &&
    baseUrl !== DEFAULT_BASE_URLS.openai
  )
    provider = "custom";

  return {
    provider,
    model,
    baseUrl,
    hasApiKey: apiKey.length > 0 && !apiKey.startsWith("your-"),
  };
}

/**
 * 检查配置是否就绪（是否有可用的 API Key）
 *
 * 返回 true 表示可以调用 LLM，false 表示需要用户先配置环境变量。
 */
export function isConfigured(): boolean {
  return getConfig().hasApiKey;
}

/**
 * 获取配置错误列表（中文提示）
 *
 * 返回用户可读的错误信息数组，空数组表示配置正常。
 * 用于在 UI 中展示配置状态提示。
 */
export function getConfigErrors(): string[] {
  const errors: string[] = [];
  const apiKey = getEnv(ENV_KEYS.API_KEY) || "";
  const model = getEnv(ENV_KEYS.MODEL) || "";

  if (!apiKey || apiKey.startsWith("your-")) {
    errors.push(
      "未配置 LLM API Key。请在 .env.local 中设置 LLM_API_KEY。"
    );
  }

  if (!model) {
    errors.push("未配置模型名称。请在 .env.local 中设置 LLM_MODEL。");
  }

  return errors;
}
