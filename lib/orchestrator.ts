// ============================================================
// AnalysisOrchestrator — 业务流程编排器
//
// 职责：串联文档解析的完整流程：
//       提取文本 → 构建 Prompt → 调用 LLM → 解析结果
//       管理步骤状态、耗时、错误处理
// 不负责：直接操作 UI、直接操作文件系统
// ============================================================

import type {
  AnalysisResult,
  AnalysisError,
  StepLog,
  FileType,
} from "@/types";
import { extractTextFromFile } from "@/lib/textExtractor";
import { buildAlpacaPrompt } from "@/lib/promptBuilder";
import { callLLM, type LLMCallConfig } from "@/lib/aiClient";
import { parseAlpacaResponse } from "@/lib/resultParser";
import { runFullExtraction } from "@/lib/datasetGeneration";

/** 超过此字符数则启用分块切片，避免单次 prompt 截断丢失内容 */
const CHUNK_THRESHOLD = 80000;

/**
 * 完整执行一次文档分析流程
 *
 * 按顺序执行：文本提取 → Prompt 构建 → LLM 调用 → 结果解析。
 * 每步独立 try-catch，即使某步失败也返回尽可能多的上下文。
 *
 * @param buffer 文档文件二进制数据
 * @param fileType 文档类型
 * @param sourceName 源文件名（用于日志和展示）
 * @param systemPrompt 自定义 System Prompt（可选，默认使用通用模板）
 * @param llmConfig LLM 调用配置（apiKey, baseUrl, model），可选，不传则读环境变量
 * @returns 完整的分析结果（含步骤日志）
 */
export async function analyzeDocument(
  buffer: Buffer,
  fileType: FileType,
  sourceName: string,
  systemPrompt?: string,
  llmConfig?: LLMCallConfig
): Promise<AnalysisResult> {
  const steps: StepLog[] = [];

  // ---- Step 1: 文本提取 ----
  const [s1, s1done] = step("提取文本");
  try {
    const extracted = await extractTextFromFile(buffer, fileType, sourceName);
    s1done("success", `提取到 ${extracted.charCount} 个字符`);
    steps.push(s1);

    // 检查提取结果是否为空
    if (!extracted.text || extracted.text.trim().length === 0) {
      const err: AnalysisError = {
        step: "提取文本",
        message: "未能从文档中提取到任何文本内容。该文档可能为扫描件或图片型 PDF。",
      };
      return { success: false, extractedText: extracted, steps, error: err };
    }

    // ---- 大文件分支：超过阈值则分块切片，逐块提取后全局去重 ----
    if (extracted.charCount > CHUNK_THRESHOLD) {
      const [sc, scdone] = step("分块切片分析");
      try {
        const result = await runFullExtraction(extracted, llmConfig);
        scdone(
          "success",
          `共 ${result.totalChunks} 块，去重前 ${result.totalBeforeDedup} 条 → 去重后 ${result.totalAfterDedup} 条`
        );
        steps.push(sc);

        const dataset = {
          items: result.items,
          totalCount: result.totalBeforeDedup,
          validCount: result.totalAfterDedup,
          parseErrors: [] as string[],
        };

        return {
          success: true,
          extractedText: extracted,
          dataset,
          steps,
        };
      } catch (chunkErr) {
        const msg =
          chunkErr instanceof Error ? chunkErr.message : "分块切片分析失败";
        scdone("failed", msg);
        steps.push(sc);
        return {
          success: false,
          extractedText: extracted,
          error: { step: "分块切片分析", message: msg },
          steps,
        };
      }
    }

    // ---- Step 2: 构建 Prompt ----
    const [s2, s2done] = step("构建 Prompt");
    try {
      const llmRequest = buildAlpacaPrompt(extracted, systemPrompt);
      s2done("success", `构建完成`);
      steps.push(s2);

      // 从环境变量读取模型名称
      llmRequest.model = process.env.LLM_MODEL || "gpt-4o";

      // ---- Step 3: 调用 LLM ----
      const [s3, s3done] = step("调用 LLM");
      try {
        const llmResponse = await callLLM(llmRequest, llmConfig);
        s3done(
          "success",
          `模型: ${llmResponse.model}，Token 用量: ${llmResponse.usage.totalTokens}`
        );
        steps.push(s3);

        // ---- Step 4: 解析结果 ----
        const [s4, s4done] = step("解析结果");
        try {
          const dataset = parseAlpacaResponse(llmResponse.rawContent);
          s4done(
            "success",
            `解析完成，有效数据 ${dataset.validCount}/${dataset.totalCount} 条`
          );
          steps.push(s4);

          return {
            success: true,
            extractedText: extracted,
            dataset,
            steps,
          };
        } catch (parseErr) {
          const msg = parseErr instanceof Error ? parseErr.message : "结果解析失败";
          s4done("failed", msg);
          steps.push(s4);
          return {
            success: false,
            extractedText: extracted,
            error: { step: "解析结果", message: msg },
            steps,
          };
        }
      } catch (llmErr) {
        const msg = llmErr instanceof Error ? llmErr.message : "LLM 调用失败";
        s3done("failed", msg);
        steps.push(s3);
        return {
          success: false,
          extractedText: extracted,
          error: { step: "调用 LLM", message: msg },
          steps,
        };
      }
    } catch (promptErr) {
      const msg = promptErr instanceof Error ? promptErr.message : "Prompt 构建失败";
      s2done("failed", msg);
      steps.push(s2);
      return {
        success: false,
        extractedText: extracted,
        error: { step: "构建 Prompt", message: msg },
        steps,
      };
    }
  } catch (extractErr) {
    const msg = extractErr instanceof Error ? extractErr.message : "文本提取失败";
    s1done("failed", msg);
    steps.push(s1);
    return {
      success: false,
      error: { step: "提取文本", message: msg },
      steps,
    };
  }
}

// ============================================================
// 步骤计时工具
// ============================================================

/**
 * 创建一个步骤追踪器
 *
 * 返回 [stepLog, finish] 元组。
 * 调用 finish(status, message?) 会自动填入 durationMs。
 */
function step(
  stepName: string
): [StepLog, (status: "success" | "failed", message?: string) => void] {
  const startTime = Date.now();
  const log: StepLog = {
    stepName,
    status: "running",
    durationMs: 0,
  };

  const finish = (status: "success" | "failed", message?: string) => {
    log.status = status;
    log.durationMs = Date.now() - startTime;
    if (message) log.message = message;
  };

  return [log, finish];
}
