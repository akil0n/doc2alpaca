// ============================================================
// GET /api/progress — 查询深度提取会话进度
//
// 用于前端页面加载时检测未完成任务，支持恢复。
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getSession, getPendingSessions, loadProgress } from "@/lib/sessionManager";

/**
 * GET /api/progress?sessionId=xxx&items=true
 *
 * 查询指定会话的状态和进度。
 * items=true 时返回所有轮次的完整数据条目。
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  // ---- 按 sessionId 查询 ----
  if (sessionId) {
    const meta = await getSession(sessionId);
    if (!meta) {
      return NextResponse.json(
        { found: false, message: "会话不存在" },
        { status: 404 }
      );
    }

    const [rounds, truncated] = await loadProgress(sessionId);
    const totalItems = rounds.reduce((sum, r) => sum + r.items.length, 0);

    const includeItems = request.nextUrl.searchParams.get("items") === "true";

    return NextResponse.json({
      found: true,
      meta,
      progress: {
        totalRounds: rounds.length,
        totalItems,
        rounds: rounds.map((r) => ({
          round: r.round,
          validCount: r.validCount,
          finishReason: r.finishReason,
        })),
        truncated,
      },
      ...(includeItems ? { items: rounds.flatMap((r) => r.items) } : {}),
    });
  }

  // ---- 列出所有未完成会话 ----
  const pending = await getPendingSessions();

  // 只返回基本信息，不包含完整的 items 数据
  const summary = pending.map((meta) => ({
    sessionId: meta.sessionId,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    fileName: meta.sourceFile.fileName,
    stats: meta.stats,
  }));

  return NextResponse.json({
    found: summary.length > 0,
    sessions: summary,
  });
}

/**
 * DELETE /api/progress?sessionId=xxx
 *
 * 删除指定会话的进度文件（中断/取消任务时调用）。
 */
export async function DELETE(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId 参数" }, { status: 400 });
  }

  const { unlink } = await import("fs/promises");
  const { join } = await import("path");
  const { cwd } = await import("process");

  const dir = join(cwd(), ".tmp", "sessions", sessionId);

  let deleted = 0;
  for (const name of ["meta.json", "progress.jsonl"]) {
    try {
      await unlink(join(dir, name));
      deleted++;
    } catch {
      // 文件可能不存在
    }
  }
  try {
    await unlink(dir);
  } catch {
    // 目录可能非空
  }

  return NextResponse.json({ deleted: deleted > 0 });
}
