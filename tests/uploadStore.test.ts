import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claimUpload, storeUpload } from "../lib/uploadStore.ts";

test("an upload is addressed by an opaque id and only its owner can claim it", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "doc2alpaca-upload-"));
  try {
    const stored = await storeUpload(
      {
        buffer: Buffer.from("private document"),
        fileName: "../../report.txt",
        fileType: "txt",
        fileSize: 16,
        ownerToken: "browser-session-a",
      },
      { rootDir }
    );

    assert.match(stored.uploadId, /^[a-f0-9]{64}$/);
    assert.equal(stored.fileName, "report.txt");
    assert.equal("filePath" in stored, false);
    assert.equal("tempPath" in stored, false);

    await assert.rejects(
      claimUpload(stored.uploadId, "browser-session-b", { rootDir }),
      /not found/i
    );

    const claimed = await claimUpload(stored.uploadId, "browser-session-a", {
      rootDir,
    });
    assert.equal(claimed.fileName, "report.txt");
    assert.equal(claimed.buffer.toString(), "private document");

    await claimed.dispose();
    await assert.rejects(readFile(claimed.internalPath), /ENOENT/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
