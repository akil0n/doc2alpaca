import { rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { cwd } from "node:process";
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

const CHECKPOINT_DIR = join(cwd(), ".tmp", "extraction-sessions");

export function isCheckpointCompatible(
  checkpoint: ExtractionCheckpoint | null,
  fingerprint: string
): checkpoint is ExtractionCheckpoint {
  return Boolean(
    checkpoint &&
      checkpoint.schemaVersion === 1 &&
      checkpoint.fingerprint === fingerprint
  );
}

/** Source-bearing checkpoints are disabled by the production privacy policy. */
export async function loadExtractionCheckpoint(): Promise<null> {
  return null;
}

/** Prevent future callers from persisting QARecord.source evidence by mistake. */
export async function saveExtractionCheckpoint(): Promise<never> {
  throw new Error("Extraction checkpoints are disabled by the privacy policy");
}

export async function purgeExtractionCheckpoints(): Promise<void> {
  await rm(CHECKPOINT_DIR, { recursive: true, force: true }).catch(() => undefined);
}

export async function removeExtractionCheckpoint(sessionId: string): Promise<void> {
  await rm(join(CHECKPOINT_DIR, safePart(sessionId)), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
  await unlink(join(CHECKPOINT_DIR, `${safePart(sessionId)}.json`)).catch(
    () => undefined
  );
}

function safePart(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 96);
  if (!safe) throw new Error("无效的提取会话标识");
  return safe;
}
