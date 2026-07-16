// ============================================================
// SessionManager — 深度提取会话管理
//
// 职责：管理深度提取的会话生命周期，包括：
//       - 会话创建 / 更新 / 查询
//       - progress.jsonl 的原子追加与校验
//       - meta.json 的原子更新
//       - 未完成任务检测
// ============================================================

import { writeFile, readFile, rename, unlink, appendFile, mkdir, readdir } from "fs/promises";
import { existsSync } from "fs";
import { open } from "fs/promises";
import { join } from "path";
import { cwd } from "process";
import type { SessionMeta, DeepRoundResult, SessionStatus, DeepEngineConfig, FileType } from "@/types";

/** 会话根目录 */
const SESSIONS_DIR = join(cwd(), ".tmp", "sessions");

/** 默认引擎配置 */
export const DEFAULT_DEEP_CONFIG: DeepEngineConfig = {
  maxRounds: 5,
  similarityThreshold: 0.9,
  maxTokens: 65536,
};

// ===================== 会话 ID =====================

/**
 * 生成唯一会话 ID
 *
 * 格式：session_{时间戳36进制}_{4位随机字符}
 */
export function createSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `session_${ts}_${rand}`;
}

/** 获取会话目录路径 */
export function getSessionDir(sessionId: string): string {
  return join(SESSIONS_DIR, sessionId);
}

/** 获取 meta.json 路径 */
function getMetaPath(sessionId: string): string {
  return join(SESSIONS_DIR, sessionId, "meta.json");
}

/** 获取 progress.jsonl 路径 */
function getProgressPath(sessionId: string): string {
  return join(SESSIONS_DIR, sessionId, "progress.jsonl");
}

/** 获取临时文件路径（用于原子写） */
function getTempPath(sessionId: string, name: string): string {
  return join(SESSIONS_DIR, sessionId, `.${name}.tmp`);
}

// ===================== 创建与初始化 =====================

/**
 * 创建新会话
 *
 * 创建会话目录，写入初始 meta.json。
 *
 * @param sourceFile 源文件信息
 * @param config 引擎配置（可选，使用默认值）
 * @returns 新会话的 meta 信息
 */
export async function createSession(
  sourceFile: { filePath: string; fileName: string; fileType: FileType },
  config?: Partial<DeepEngineConfig>
): Promise<SessionMeta> {
  const sessionId = createSessionId();
  const dir = getSessionDir(sessionId);

  await mkdir(dir, { recursive: true });

  const meta: SessionMeta = {
    sessionId,
    status: "running",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sourceFile,
    config: { ...DEFAULT_DEEP_CONFIG, ...config },
    stats: {
      totalRounds: 0,
      totalItems: 0,
      lastFinishReason: null,
    },
  };

  await atomicWriteJSON(getMetaPath(sessionId), meta);
  return meta;
}

// ===================== 读写元信息 =====================

/**
 * 获取会话元信息
 */
export async function getSession(sessionId: string): Promise<SessionMeta | null> {
  const metaPath = getMetaPath(sessionId);
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

/**
 * 更新会话元信息（原子写入）
 *
 * 先写入临时文件，再 rename 覆盖原文件。
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<SessionMeta>
): Promise<SessionMeta | null> {
  const meta = await getSession(sessionId);
  if (!meta) return null;

  const updated: SessionMeta = {
    ...meta,
    ...updates,
    stats: updates.stats ? { ...meta.stats, ...updates.stats } : meta.stats,
    updatedAt: Date.now(),
  };

  await atomicWriteJSON(getMetaPath(sessionId), updated);
  return updated;
}

// ===================== 进度文件（JSONL） =====================

/**
 * 追加一轮结果到 progress.jsonl
 *
 * 使用 fs.appendFile 写入一行 JSON，然后执行 fsync 确保落盘。
 * 即使进程崩溃也不会丢失已 sync 的数据。
 */
export async function appendRound(
  sessionId: string,
  result: DeepRoundResult
): Promise<void> {
  const progressPath = getProgressPath(sessionId);
  const dir = getSessionDir(sessionId);

  // 确保目录存在
  await mkdir(dir, { recursive: true });

  // 打开文件（追加模式），写入后 fsync
  const fd = await open(progressPath, "a");
  try {
    const line = JSON.stringify(result) + "\n";
    await fd.write(line);
    await fd.sync(); // 强制写入磁盘
  } finally {
    await fd.close();
  }
}

/**
 * 加载并校验 progress.jsonl
 *
 * 逐行解析 JSON，遇到非法行则截断到上一行。
 * 返回 [有效轮次列表, 是否发生过截断]
 */
export async function loadProgress(
  sessionId: string
): Promise<[DeepRoundResult[], boolean]> {
  const progressPath = getProgressPath(sessionId);
  let content: string;
  try {
    content = await readFile(progressPath, "utf-8");
  } catch {
    return [[], false];
  }

  if (!content.trim()) return [[], false];

  const lines = content.split("\n");
  const valid: DeepRoundResult[] = [];
  let truncated = false;

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as DeepRoundResult;
      // 基本字段校验
      if (typeof parsed.round !== "number" || !Array.isArray(parsed.items)) {
        throw new Error("Invalid round result structure");
      }
      valid.push(parsed);
    } catch {
      // 遇到非法行 → 之后的数据都不可信，截断
      truncated = true;
      break;
    }
  }

  // 如果发生了截断，将截断后的内容写回文件
  if (truncated) {
    const cleanContent = valid.map((r) => JSON.stringify(r)).join("\n") + "\n";
    await atomicWrite(progressPath, cleanContent);
  }

  return [valid, truncated];
}

/**
 * 获取所有未完成的会话
 *
 * 扫描 sessions 目录，返回所有状态不为 "completed" 的会话 meta。
 */
export async function getPendingSessions(): Promise<SessionMeta[]> {
  try {
    const entries = await readdir(SESSIONS_DIR, { withFileTypes: true });
    const results: SessionMeta[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(SESSIONS_DIR, entry.name, "meta.json");
      try {
        const raw = await readFile(metaPath, "utf-8");
        const meta = JSON.parse(raw) as SessionMeta;
        if (meta.status !== "completed") {
          results.push(meta);
        }
      } catch {
        // 忽略损坏的会话目录
        continue;
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * 清理超过指定时间的会话目录
 */
export async function cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  try {
    const entries = await readdir(SESSIONS_DIR, { withFileTypes: true });
    const now = Date.now();
    let cleaned = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = join(SESSIONS_DIR, entry.name, "meta.json");
      try {
        const raw = await readFile(metaPath, "utf-8");
        const meta = JSON.parse(raw) as SessionMeta;
        if (now - meta.updatedAt > maxAgeMs) {
          await unlink(metaPath).catch(() => {});
          await unlink(getProgressPath(entry.name)).catch(() => {});
          await unlink(getTempPath(entry.name, "meta.json")).catch(() => {});
          await unlink(getTempPath(entry.name, "progress.jsonl")).catch(() => {});
          await readdir(getSessionDir(entry.name)).then((files) => {
            if (files.length === 0) {
              unlink(getSessionDir(entry.name)).catch(() => {});
            }
          });
          cleaned++;
        }
      } catch {
        continue;
      }
    }

    return cleaned;
  } catch {
    return 0;
  }
}

// ===================== 私有工具 =====================

/**
 * 原子写入 JSON 文件
 *
 * 先写入 .tmp 文件，然后 rename 覆盖目标文件。
 * 这样即使写入中途崩溃，原文件也不会损坏。
 */
async function atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
  const tmpPath = filePath + ".tmp";
  const content = JSON.stringify(data, null, 2);
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}

/**
 * 原子写入文本文件
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}
