import test from "node:test";
import assert from "node:assert/strict";
import { validateUpload } from "../lib/uploadValidation.ts";

test("uploads without an approved MIME type are rejected", async () => {
  await assert.rejects(
    validateUpload({
      buffer: Buffer.from("plain text"),
      fileName: "notes.txt",
      mimeType: "application/octet-stream",
    }),
    /MIME/i
  );
});
