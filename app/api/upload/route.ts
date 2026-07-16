import { NextRequest, NextResponse } from "next/server";
import { inferFileType } from "@/lib/textExtractor";
import type { FileType, FileMeta } from "@/types";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { cwd } from "process";

/** 最大文件大小：10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 允许的文件扩展名列表（用于快速前端校验） */
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".pptx", ".ppt", ".txt", ".md", ".markdown", ".html", ".htm"];

/**
 * POST /api/upload
 *
 * 接收上传的文件，校验类型和大小，保存到临时目录。
 * 返回文件的元信息（fileName, fileType, fileSize, tempPath）。
 *
 * Body: FormData 中的 file 字段
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "请选择一个文件上传。" },
        { status: 400 }
      );
    }

    // 校验文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB）。最大支持 10MB。`,
        },
        { status: 400 }
      );
    }

    // 校验文件类型
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        {
          error: `不支持的文件格式 "${ext}"。支持的格式：PDF、DOCX、PPTX、TXT、MD、HTML。`,
        },
        { status: 400 }
      );
    }

    // 推断 FileType
    let fileType: FileType;
    try {
      fileType = inferFileType(file.name);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "不支持的文件格式。" },
        { status: 400 }
      );
    }

    // 读取文件内容
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 保存到临时目录
    const tmpDir = join(cwd(), ".tmp");
    const tmpPath = join(tmpDir, `${Date.now()}-${file.name}`);

    try {
      await writeFile(tmpPath, buffer);
    } catch {
      // 如果 .tmp 目录不存在，创建并重试
      const { mkdir } = await import("fs/promises");
      await mkdir(tmpDir, { recursive: true });
      await writeFile(tmpPath, buffer);
    }

    const meta: FileMeta = {
      fileName: file.name,
      fileType,
      fileSize: file.size,
      tempPath: tmpPath,
    };

    return NextResponse.json(meta);
  } catch (err) {
    return NextResponse.json(
      {
        error: `上传失败：${err instanceof Error ? err.message : "未知错误"}`,
      },
      { status: 500 }
    );
  }
}
