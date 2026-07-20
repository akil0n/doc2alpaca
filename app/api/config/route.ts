import { getConfig } from "@/lib/configService";
import { currentUserId } from "@/lib/authGuard";
import { NextResponse } from "next/server";

/**
 * GET /api/config
 *
 * 返回当前 LLM 配置状态。
 * 客户端根据此接口显示配置提示或正常操作界面。
 */
export async function GET() {
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const config = getConfig();
  return NextResponse.json({
    hasApiKey: config.hasApiKey,
    provider: config.provider,
    model: config.model,
  });
}
