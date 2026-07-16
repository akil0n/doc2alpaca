import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "fs/promises";
import { analyzeDocument } from "@/lib/orchestrator";
import { getConfig } from "@/lib/configService";
import type { FileType } from "@/types";
import type { LLMCallConfig } from "@/lib/aiClient";

/**
 * POST /api/analyze
 *
 * 对已上传的文档执行完整分析流程。
 * 支持从请求体传入 LLM 配置（来自 UI 配置面板），
 * 也支持从环境变量读取配置（向后兼容）。
 *
 * Body: {
 *   filePath: string,
 *   fileType: FileType,
 *   fileName: string,
 *   systemPrompt?: string,
 *   llmConfig?: { apiKey: string, baseUrl: string, model: string }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath, fileType, fileName, systemPrompt, llmConfig } = body as {
      filePath: string;
      fileType: FileType;
      fileName: string;
      systemPrompt?: string;
      llmConfig?: LLMCallConfig;
    };

    // 参数校验
    if (!filePath || !fileType || !fileName) {
      return NextResponse.json(
        {
          success: false,
          error: {
            step: "参数校验",
            message: "缺少必要参数：filePath、fileType、fileName。",
          },
          steps: [],
        },
        { status: 400 }
      );
    }

    // 检查是否有有效的 LLM 配置（客户端配置 > 环境变量）
    const hasClientConfig =
      llmConfig?.apiKey &&
      !llmConfig.apiKey.startsWith("your-") &&
      !llmConfig.apiKey.startsWith("sk-your");

    const hasEnvConfig = getConfig().hasApiKey;

    if (!hasClientConfig && !hasEnvConfig) {
      return NextResponse.json(
        {
          success: false,
          error: {
            step: "配置检查",
            message:
              "LLM API Key 未配置。请点击页面右上角的「配置」按钮设置 LLM 厂商和 API Key。",
          },
          steps: [],
        },
        { status: 400 }
      );
    }

    // 读取文件
    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            step: "读取文件",
            message: "无法读取上传的文件，文件可能已被删除或路径不正确。",
          },
          steps: [],
        },
        { status: 400 }
      );
    }

    // 执行分析流程（传入 systemPrompt 和 llmConfig）
    const result = await analyzeDocument(
      buffer,
      fileType,
      fileName,
      systemPrompt,
      llmConfig
    );

    // 清理临时文件（异步，不阻塞响应）
    unlink(filePath).catch(() => {});

    const status = result.success === false && !result.extractedText ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: {
          step: "服务端处理",
          message: err instanceof Error ? err.message : "服务端处理出错，请重试。",
        },
        steps: [],
      },
      { status: 500 }
    );
  }
}
