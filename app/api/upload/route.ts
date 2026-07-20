import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/authGuard";
import { consumeUserRateLimit } from "@/lib/rateLimit";
import { cleanupExpiredUploads, startUploadJanitor, storeUpload } from "@/lib/uploadStore";
import { validateUpload } from "@/lib/uploadValidation";

export const runtime = "nodejs";

startUploadJanitor();

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isSameOrigin(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "拒绝跨站上传请求。" }, { status: 403 });
  }

  try {
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    if (!(await consumeUserRateLimit(userId, "upload", 60))) {
      return NextResponse.json({ error: "上传请求过于频繁" }, { status: 429 });
    }
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "请选择一个文件上传。" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "文件必须大于 0 字节且不能超过 10MB。" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let fileType;
    try {
      ({ fileType } = await validateUpload({
        buffer,
        fileName: file.name,
        mimeType: file.type,
      }));
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `文件校验失败：${error.message}`
              : "文件校验失败。",
        },
        { status: 400 }
      );
    }

    const meta = await storeUpload({
      buffer,
      fileName: file.name,
      fileType,
      fileSize: file.size,
      ownerToken: userId,
    });

    cleanupExpiredUploads().catch(() => {});

    return NextResponse.json(meta);
  } catch {
    return NextResponse.json(
      { error: "上传失败，请稍后重试。" },
      { status: 500 }
    );
  }
}
