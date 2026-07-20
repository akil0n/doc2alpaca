import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { cwd } from "node:process";
import type { FileType } from "@/types";

const DEFAULT_ROOT_DIR = join(cwd(), ".tmp", "uploads");
const UPLOAD_ID_PATTERN = /^[a-f0-9]{64}$/;

interface UploadStoreOptions {
  rootDir?: string;
}

interface StoreUploadInput {
  buffer: Buffer;
  fileName: string;
  fileType: FileType;
  fileSize: number;
  ownerToken: string;
}

interface UploadMetadata {
  fileName: string;
  fileType: FileType;
  fileSize: number;
  ownerHash: string;
  createdAt: number;
}

export interface StoredUpload {
  uploadId: string;
  fileName: string;
  fileType: FileType;
  fileSize: number;
}

export interface ClaimedUpload {
  buffer: Buffer;
  fileName: string;
  fileType: FileType;
  fileSize: number;
  /** Server-only path used for lifecycle verification and cleanup. */
  internalPath: string;
  dispose(): Promise<void>;
}

function ownerHash(ownerToken: string): string {
  return createHash("sha256").update(ownerToken).digest("hex");
}

function sameOwner(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function uploadDir(uploadId: string, rootDir: string): string {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new Error("Upload not found");
  }
  return join(rootDir, uploadId);
}

export async function storeUpload(
  input: StoreUploadInput,
  options: UploadStoreOptions = {}
): Promise<StoredUpload> {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const uploadId = randomBytes(32).toString("hex");
  const dir = uploadDir(uploadId, rootDir);
  const fileName = basename(input.fileName);
  const metadata: UploadMetadata = {
    fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    ownerHash: ownerHash(input.ownerToken),
    createdAt: Date.now(),
  };

  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, "content"), input.buffer, { mode: 0o600 });
  await writeFile(join(dir, "meta.json"), JSON.stringify(metadata), {
    encoding: "utf8",
    mode: 0o600,
  });

  return {
    uploadId,
    fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
  };
}

export async function claimUpload(
  uploadId: string,
  ownerToken: string,
  options: UploadStoreOptions = {}
): Promise<ClaimedUpload> {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const dir = uploadDir(uploadId, rootDir);

  let metadata: UploadMetadata;
  try {
    metadata = JSON.parse(
      await readFile(join(dir, "meta.json"), "utf8")
    ) as UploadMetadata;
  } catch {
    throw new Error("Upload not found");
  }

  if (!sameOwner(metadata.ownerHash, ownerHash(ownerToken))) {
    throw new Error("Upload not found");
  }

  const internalPath = join(dir, "claimed");
  try {
    await rename(join(dir, "content"), internalPath);
  } catch {
    throw new Error("Upload not found");
  }

  try {
    const buffer = await readFile(internalPath);
    return {
      buffer,
      fileName: metadata.fileName,
      fileType: metadata.fileType,
      fileSize: metadata.fileSize,
      internalPath,
      dispose: () => rm(dir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function cleanupExpiredUploads(
  options: UploadStoreOptions & { maxAgeMs?: number } = {}
): Promise<number> {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const maxAgeMs = options.maxAgeMs ?? 30 * 60 * 1000;
  const now = Date.now();
  let removed = 0;

  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !UPLOAD_ID_PATTERN.test(entry.name)) continue;
    const dir = uploadDir(entry.name, rootDir);
    try {
      const metadata = JSON.parse(
        await readFile(join(dir, "meta.json"), "utf8")
      ) as UploadMetadata;
      if (now - metadata.createdAt <= maxAgeMs) continue;
    } catch {
      // Invalid metadata is an orphan too.
    }
    await rm(dir, { recursive: true, force: true });
    removed++;
  }

  return removed;
}


const JANITOR_INTERVAL_MS = 10 * 60 * 1000;
let janitorTimer: ReturnType<typeof setInterval> | null = null;

export function startUploadJanitor(): void {
  if (janitorTimer) return;
  cleanupExpiredUploads().catch(() => {});
  janitorTimer = setInterval(() => {
    cleanupExpiredUploads().catch(() => {});
  }, JANITOR_INTERVAL_MS);
  janitorTimer.unref?.();
}
