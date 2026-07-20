import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/authGuard";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import {
  deleteGeneratedHistory,
  listGeneratedHistory,
} from "@/lib/userDataStore";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "请先登录" }, { status: 401 });
}

export async function GET() {
  try {
    return NextResponse.json({ records: await listGeneratedHistory(await requireUserId()) });
  } catch (error) {
    return error instanceof Error && error.message === "UNAUTHENTICATED"
      ? unauthorized()
      : NextResponse.json({ error: "历史记录读取失败" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "历史记录只能由服务端分析流程创建" },
    { status: 405, headers: { Allow: "GET, DELETE" } }
  );
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "拒绝跨站请求" }, { status: 403 });
  }
  try {
    const userId = await requireUserId();
    const id = request.nextUrl.searchParams.get("id") || undefined;
    return NextResponse.json({ deleted: await deleteGeneratedHistory(userId, id) });
  } catch (error) {
    return error instanceof Error && error.message === "UNAUTHENTICATED"
      ? unauthorized()
      : NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
