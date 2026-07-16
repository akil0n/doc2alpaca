// ============================================================
// AIClient — LLM API 调用客户端
//
// 职责：通过 OpenAI 兼容 API 调用 LLM，处理认证和错误
//       支持从参数或环境变量获取配置
// 不负责：构建 prompt、解析返回结果
// ============================================================

import type { LLMRequest, LLMResponse } from "@/types";

/** 调用 LLM 时的默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 300_000;

/** 输出最大 token 数（不设则 LLM 用保守默认值，通常只有 4096） */
const DEFAULT_MAX_TOKENS = 65536;

/** 最大重试次数 */
const MAX_RETRIES = 1;

/**
 * LLM 调用配置（可选，不传则读取环境变量）
 */
export interface LLMCallConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * 调用 LLM
 *
 * 通过 OpenAI 兼容接口发送请求并返回结果。
 * 优先使用传入的 config，未传入时从环境变量读取。
 *
 * @param request LLM 请求（messages、temperature 等）
 * @param config 调用配置（apiKey、baseUrl、model），可选
 * @returns LLM 响应（原始文本 + token 用量）
 * @throws Error 如果 API Key 未配置或调用失败
 */
export async function callLLM(
  request: LLMRequest,
  config?: LLMCallConfig
): Promise<LLMResponse> {
  // 获取配置：参数优先 > 环境变量
  const apiKey =
    config?.apiKey ||
    process.env.LLM_API_KEY ||
    process.env.NEXT_PUBLIC_LLM_API_KEY ||
    "";

  const baseUrl = (
    config?.baseUrl ||
    process.env.LLM_BASE_URL ||
    process.env.NEXT_PUBLIC_LLM_BASE_URL ||
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");

  const model =
    config?.model ||
    request.model ||
    process.env.LLM_MODEL ||
    process.env.NEXT_PUBLIC_LLM_MODEL ||
    "gpt-4o";

  // 校验 API Key
  if (!apiKey || apiKey.startsWith("your-") || apiKey.startsWith("sk-your")) {
    throw new Error(
      "LLM API Key 未配置。请点击页面右上角的「配置」按钮设置 LLM 厂商和 API Key，或在 .env.local 中配置 LLM_API_KEY。"
    );
  }

  // 构建请求体
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
    temperature: request.temperature ?? 0.3,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
  };

  // 仅在明确要求 JSON 格式时添加（部分模型/供应商不支持此参数）
  if (request.response_format) {
    body.response_format = request.response_format;
  }

  let lastError: Error | null = null;

  // 带重试的调用循环
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 处理 HTTP 错误
      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(mapHttpError(response.status, errorText));
      }

      const data = await response.json();

      // 验证响应结构
      if (!data.choices?.[0]?.message?.content) {
        throw new Error("LLM 返回了空结果，请检查模型配置后重试。");
      }

      const finishReasonRaw: string = data.choices[0]?.finish_reason || null;
      const finishReason = finishReasonRaw === "stop" ? "stop"
        : finishReasonRaw === "length" ? "length"
        : null;

      return {
        rawContent: data.choices[0].message.content,
        model: data.model || model,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        finishReason,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 部分 OpenAI 兼容供应商不支持 response_format；自动降级后重试。
      if (body.response_format && /response_format|json.?mode|unsupported/i.test(lastError.message)) {
        delete body.response_format;
        if (attempt < MAX_RETRIES) continue;
      }

      // 认证错误不重试
      if (
        lastError.message.includes("API Key") ||
        lastError.message.includes("401") ||
        lastError.message.includes("Unauthorized")
      ) {
        break;
      }

      // 最后一次重试也失败，继续走，最后统一抛错
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  // 所有重试都失败，抛出最终错误
  throw new Error(
    `LLM 调用失败：${lastError?.message || "未知错误"}。请检查网络连接和 API 配置。`
  );
}

// ============================================================
// 内部工具
// ============================================================

/**
 * 将 HTTP 状态码映射为用户可读的中文错误信息
 */
function mapHttpError(status: number, errorText: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(errorText);
    detail = parsed.error?.message || "";
  } catch {
    detail = errorText.slice(0, 200);
  }

  const prefix = detail ? `（${detail}）` : "";

  switch (status) {
    case 400:
      return `请求参数错误${prefix}，请检查 Base URL 和模型名称配置是否正确。`;
    case 401:
      return `API Key 认证失败${prefix}，请检查 API Key 是否正确。`;
    case 429:
      return `请求过于频繁${prefix}，请稍后重试。`;
    case 500:
    case 502:
    case 503:
      return `LLM 服务暂时不可用${prefix}，请稍后重试。`;
    default:
      return `HTTP ${status}${prefix}`;
  }
}
