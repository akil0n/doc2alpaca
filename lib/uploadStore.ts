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

async function loadOwnedMetadata(
  dir: string,
  ownerToken: string,
): Promise<UploadMetadata> {
  try {
    const parsed = JSON.parse(
      await readFile(join(dir, "meta.json"), "utf8"),
    ) as Partial<UploadMetadata> | null;
    if (
      !parsed ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.fileType !== "string" ||
      typeof parsed.fileSize !== "number" ||
      typeof parsed.ownerHash !== "string" ||
      typeof parsed.createdAt !== "number" ||
      !sameOwner(parsed.ownerHash, ownerHash(ownerToken))
    ) {
      throw new Error("invalid upload metadata");
    }
    return parsed as UploadMetadata;
  } catch {
    // 不区分资源不存在、元数据损坏和所有者不匹配，避免泄漏上传是否存在。
    throw new Error("Upload not found");
  }
}

export async function storeUpload(
  input: StoreUploadInput,
  options: UploadStoreOptions = {},
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

/**
 * 只读校验上传存在且属于指定用户，不消费（claim）。
 * 用于异步队列模式：API 路由先校验，真正的消费发生在 worker 进程。
 */
export async function peekUpload(
  uploadId: string,
  ownerToken: string,
  options: UploadStoreOptions = {},
): Promise<StoredUpload> {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const dir = uploadDir(uploadId, rootDir);

  const metadata = await loadOwnedMetadata(dir, ownerToken);

  return {
    uploadId,
    fileName: metadata.fileName,
    fileType: metadata.fileType,
    fileSize: metadata.fileSize,
  };
}

export async function claimUpload(
  uploadId: string,
  ownerToken: string,
  options: UploadStoreOptions & { allowReclaim?: boolean } = {},
): Promise<ClaimedUpload> {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;
  const dir = uploadDir(uploadId, rootDir);

  const metadata = await loadOwnedMetadata(dir, ownerToken);

  const internalPath = join(dir, "claimed");
  let renamedByThisCall = false;
  try {
    // 队列模式（allowReclaim）：content 可能已被上一次尝试 claim 走，
    // 但会话未完成前文件必须保留（重试/续跑需要）。回退到 claimed 文件。
    await rename(join(dir, "content"), internalPath);
    renamedByThisCall = true;
  } catch {
    if (!options.allowReclaim) {
      throw new Error("Upload not found");
    }
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
  } catch {
    // 只有本次调用完成了 content → claimed 的所有权转移时才清理目录。
    // reclaim 读取失败可能是另一个 worker/janitor 的并发行为，不能误删共享目录。
    if (renamedByThisCall) {
      await rm(dir, { recursive: true, force: true });
    }
    throw new Error("Upload not found");
  }
}

export async function cleanupExpiredUploads(
  options: UploadStoreOptions & { maxAgeMs?: number } = {},
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
        await readFile(join(dir, "meta.json"), "utf8"),
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
