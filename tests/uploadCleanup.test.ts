import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claimUpload,
  cleanupExpiredUploads,
  storeUpload,
} from "../lib/uploadStore.ts";

test("expired orphan uploads are removed by the cleanup sweep", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "doc2alpaca-upload-"));
  try {
    const stored = await storeUpload(
      {
        buffer: Buffer.from("orphan"),
        fileName: "orphan.txt",
        fileType: "txt",
        fileSize: 6,
        ownerToken: "browser-session",
      },
      { rootDir }
    );

    assert.equal(await cleanupExpiredUploads({ rootDir, maxAgeMs: -1 }), 1);
    await assert.rejects(
      claimUpload(stored.uploadId, "browser-session", { rootDir }),
      /not found/i
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
