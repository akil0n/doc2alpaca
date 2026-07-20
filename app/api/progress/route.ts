import { rm } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import {
  getPendingSessions,
  getSession,
  getSessionDir,
  loadProgress,
  sessionBelongsTo,
} from "@/lib/sessionManager";
import { isSameOriginRequest } from "@/lib/requestSecurity";
import { currentUserId } from "@/lib/authGuard";
import type { SessionMeta } from "@/types";

export const runtime = "nodejs";

function publicMeta(meta: SessionMeta) {
  return {
    sessionId: meta.sessionId,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    sourceFile: {
      fileName: meta.sourceFile.fileName,
      fileType: meta.sourceFile.fileType,
    },
    config: meta.config,
    stats: meta.stats,
  };
}

export async function GET(request: NextRequest) {
  const ownerToken = await currentUserId();
  if (!ownerToken) {
    return NextResponse.json({ found: false }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (sessionId) {
    let meta;
    try {
      meta = await getSession(sessionId);
    } catch {
      meta = null;
    }
    if (!meta || !sessionBelongsTo(meta, ownerToken)) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    const [rounds, truncated] = await loadProgress(sessionId);
    const totalItems = rounds.reduce((sum, round) => sum + round.items.length, 0);
    const includeItems = request.nextUrl.searchParams.get("items") === "true";

    return NextResponse.json({
      found: true,
      meta: publicMeta(meta),
      progress: {
        totalRounds: rounds.length,
        totalItems,
        rounds: rounds.map((round) => ({
          round: round.round,
          validCount: round.validCount,
          finishReason: round.finishReason,
        })),
        truncated,
      },
      ...(includeItems ? { items: rounds.flatMap((round) => round.items) } : {}),
    });
  }

  const pending = await getPendingSessions(ownerToken);
  const sessions = pending.map((meta) => ({
    sessionId: meta.sessionId,
    status: meta.status,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    fileName: meta.sourceFile.fileName,
    stats: meta.stats,
  }));
  return NextResponse.json({ found: sessions.length > 0, sessions });
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "拒绝跨站请求" }, { status: 403 });
  }
  const ownerToken = await currentUserId();
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!ownerToken || !sessionId) {
    return NextResponse.json({ error: "会话无效" }, { status: 400 });
  }

  let meta;
  try {
    meta = await getSession(sessionId);
  } catch {
    meta = null;
  }
  if (!meta || !sessionBelongsTo(meta, ownerToken)) {
    return NextResponse.json({ deleted: false }, { status: 404 });
  }

  await rm(getSessionDir(sessionId), { recursive: true, force: true });
  return NextResponse.json({ deleted: true });
}
