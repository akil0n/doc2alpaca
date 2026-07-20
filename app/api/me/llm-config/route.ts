import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authGuard";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import {
  deleteLlmConfig,
  getLlmConfigMetadata,
  saveLlmConfig,
} from "@/lib/userDataStore";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "请先登录" }, { status: 401 });
}

export async function GET() {
  try {
    return NextResponse.json(await getLlmConfigMetadata(await requireUserId()));
  } catch (error) {
    return error instanceof Error && error.message === "UNAUTHENTICATED"
      ? unauthorized()
      : NextResponse.json({ error: "无法读取配置" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "拒绝跨站请求" }, { status: 403 });
  }
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.vendorId !== "string" ||
      typeof body.baseUrl !== "string" ||
      typeof body.model !== "string" ||
      (body.apiKey !== undefined && typeof body.apiKey !== "string")
    ) {
      return NextResponse.json({ error: "配置格式不正确" }, { status: 400 });
    }
    const metadata = await saveLlmConfig(userId, {
      vendorId: body.vendorId,
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey: body.apiKey,
    });
    return NextResponse.json(metadata);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") return unauthorized();
    const code = error instanceof Error ? error.message : "";
    if (
      code.startsWith("INVALID_") ||
      code === "API_KEY_REQUIRED" ||
      code.startsWith("LLM Base URL")
    ) {
      return NextResponse.json(
        { error: code === "API_KEY_REQUIRED" ? "首次保存必须填写 API Key" : "配置不合法或服务商地址未获准" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "配置保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "拒绝跨站请求" }, { status: 403 });
  }
  try {
    await deleteLlmConfig(await requireUserId());
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return error instanceof Error && error.message === "UNAUTHENTICATED"
      ? unauthorized()
      : NextResponse.json({ error: "配置删除失败" }, { status: 500 });
  }
}
