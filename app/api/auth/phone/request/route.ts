import { NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { requestPhoneOtp } from "@/lib/smsService";

export const runtime = "nodejs";

function requestIp(request: NextRequest): string {
  if (process.env.VERCEL) {
    return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  }
  if (process.env.CF_PAGES) {
    return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  }
  // Fail closed into one shared bucket unless a supported proxy guarantees the header.
  return "untrusted-network";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "拒绝跨站请求" }, { status: 403 });
  }
  try {
    const body = (await request.json()) as { phone?: unknown };
    if (typeof body.phone !== "string") {
      return NextResponse.json({ error: "请输入手机号" }, { status: 400 });
    }
    await requestPhoneOtp(body.phone, requestIp(request));
    return NextResponse.json({ sent: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "INVALID_PHONE") {
      return NextResponse.json({ error: "手机号格式不正确" }, { status: 400 });
    }
    if (code === "OTP_COOLDOWN" || code === "OTP_RATE_LIMIT") {
      return NextResponse.json(
        { error: "验证码请求过于频繁，请稍后再试" },
        { status: 429 }
      );
    }
    if (code === "SMS service is not configured") {
      return NextResponse.json(
        { error: "短信登录尚未配置" },
        { status: 503 }
      );
    }
    console.error("Phone OTP delivery failed");
    return NextResponse.json({ error: "验证码发送失败" }, { status: 502 });
  }
}
