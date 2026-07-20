import test from "node:test";
import assert from "node:assert/strict";
import { validateUpload } from "../lib/uploadValidation.ts";

test("upload validation rejects an extension whose file signature does not match", async () => {
  await assert.rejects(
    validateUpload({
      buffer: Buffer.from("this is not a PDF"),
      fileName: "renamed.pdf",
      mimeType: "application/pdf",
    }),
    /signature/i
  );
});
