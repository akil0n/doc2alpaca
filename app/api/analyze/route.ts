import { NextRequest, NextResponse } from "next/server";
import { analyzeDocument } from "@/lib/orchestrator";
import { currentUserId } from "@/lib/authGuard";
import { consumeUserRateLimit } from "@/lib/rateLimit";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { claimUpload } from "@/lib/uploadStore";
import { resolveLlmConfig, saveGeneratedHistory } from "@/lib/userDataStore";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: { step: "请求校验", message: "拒绝跨站请求。" }, steps: [] },
      { status: 403 }
    );
  }

  let claimed: Awaited<ReturnType<typeof claimUpload>> | null = null;
  try {
    const body = await request.json();
    const { uploadId, systemPrompt } = body as {
      uploadId?: string;
      systemPrompt?: string;
    };
    const userId = await currentUserId();

    if (!uploadId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: { step: "参数校验", message: "上传令牌无效或已过期。" },
          steps: [],
        },
        { status: 400 }
      );
    }

    claimed = await claimUpload(uploadId, userId);
    if (!(await consumeUserRateLimit(userId, "analysis", 20))) {
      return NextResponse.json({ success: false, error: { step: "频率限制", message: "分析请求过于频繁，请稍后再试" }, steps: [] }, { status: 429 });
    }

    const llmConfig = await resolveLlmConfig(userId);
    if (!llmConfig) {
      return NextResponse.json(
        {
          success: false,
          error: { step: "配置检查", message: "LLM API Key 未配置。" },
          steps: [],
        },
        { status: 400 }
      );
    }

    const result = await analyzeDocument(
      claimed.buffer,
      claimed.fileType,
      claimed.fileName,
      systemPrompt,
      llmConfig
    );
    if (result.success && result.dataset) {
      await saveGeneratedHistory(userId, { items: result.dataset.items });
    }
    const status = result.success === false && !result.extractedText ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    const isMissingUpload =
      error instanceof Error && error.message === "Upload not found";
    return NextResponse.json(
      {
        success: false,
        error: {
          step: isMissingUpload ? "读取文件" : "服务端处理",
          message: isMissingUpload
            ? "上传令牌无效、已使用或已过期。"
            : "服务端处理出错，请重试。",
        },
        steps: [],
      },
      { status: isMissingUpload ? 400 : 500 }
    );
  } finally {
    await claimed?.dispose().catch(() => {});
  }
}
