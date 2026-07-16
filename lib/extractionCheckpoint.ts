import { mkdir, readFile, rename, rm, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { cwd } from "process";
import type { QARecord } from "@/lib/qaPipeline";

export interface ExtractionCheckpoint {
  sessionId: string;
  fingerprint: string;
  schemaVersion: number;
  sourceName: string;
  completedChunkIds: string[];
  items: QARecord[];
  updatedAt: number;
}

type CheckpointManifest = Omit<ExtractionCheckpoint, "items">;
const CHECKPOINT_DIR = join(cwd(), ".tmp", "extraction-sessions");

export function isCheckpointCompatible(
  checkpoint: ExtractionCheckpoint | null,
  fingerprint: string
): checkpoint is ExtractionCheckpoint {
  return Boolean(checkpoint && checkpoint.schemaVersion === 1 && checkpoint.fingerprint === fingerprint);
}

export async function loadExtractionCheckpoint(sessionId: string): Promise<ExtractionCheckpoint | null> {
  try {
    const directory = checkpointDirectory(sessionId);
    const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf-8")) as CheckpointManifest;
    if (!manifest.fingerprint || manifest.schemaVersion !== 1 || !Array.isArray(manifest.completedChunkIds)) return null;
    const chunkItems = await Promise.all(
      manifest.completedChunkIds.map(async (chunkId) => {
        try {
          const parsed = JSON.parse(await readFile(join(directory, "chunks", `${safePart(chunkId)}.json`), "utf-8"));
          return Array.isArray(parsed) ? parsed as QARecord[] : [];
        } catch {
          return [];
        }
      })
    );
    return { ...manifest, items: chunkItems.flat() };
  } catch {
    return null;
  }
}

/**
 * Persist only newly completed chunks. The manifest is atomically replaced, so
 * checkpoint I/O grows linearly instead of rewriting every accumulated record.
 */
export async function saveExtractionCheckpoint(checkpoint: ExtractionCheckpoint): Promise<void> {
  const directory = checkpointDirectory(checkpoint.sessionId);
  const chunksDirectory = join(directory, "chunks");
  await mkdir(chunksDirectory, { recursive: true });

  let existingIds = new Set<string>();
  try {
    const existing = JSON.parse(await readFile(join(directory, "manifest.json"), "utf-8")) as CheckpointManifest;
    if (existing.fingerprint === checkpoint.fingerprint) existingIds = new Set(existing.completedChunkIds);
  } catch {
    // First checkpoint for this session.
  }

  const itemsByChunk = new Map<string, QARecord[]>();
  for (const item of checkpoint.items) {
    const values = itemsByChunk.get(item.source.chunkId) || [];
    values.push(item);
    itemsByChunk.set(item.source.chunkId, values);
  }

  await Promise.all(checkpoint.completedChunkIds
    .filter((chunkId) => !existingIds.has(chunkId))
    .map((chunkId) => writeFile(
      join(chunksDirectory, `${safePart(chunkId)}.json`),
      JSON.stringify(itemsByChunk.get(chunkId) || []),
      "utf-8"
    )));

  const manifest: CheckpointManifest = {
    sessionId: checkpoint.sessionId,
    fingerprint: checkpoint.fingerprint,
    schemaVersion: checkpoint.schemaVersion,
    sourceName: checkpoint.sourceName,
    completedChunkIds: checkpoint.completedChunkIds,
    updatedAt: checkpoint.updatedAt,
  };
  const target = join(directory, "manifest.json");
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(manifest), "utf-8");
  await rename(temporary, target);
}

export async function removeExtractionCheckpoint(sessionId: string): Promise<void> {
  await rm(checkpointDirectory(sessionId), { recursive: true, force: true }).catch(() => undefined);
  await unlink(join(CHECKPOINT_DIR, `${safePart(sessionId)}.json`)).catch(() => undefined);
}

function checkpointDirectory(sessionId: string): string {
  return join(CHECKPOINT_DIR, safePart(sessionId));
}

function safePart(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
  if (!safe) throw new Error("无效的提取会话标识");
  return safe;
}
