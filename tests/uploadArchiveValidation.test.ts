import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { validateUpload } from "../lib/uploadValidation.ts";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

test("OOXML uploads are rejected when their expanded size exceeds the limit", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types />");
  zip.file("word/document.xml", "x".repeat(512));
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  await assert.rejects(
    validateUpload({
      buffer,
      fileName: "large.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      maxExpandedSize: 100,
    }),
    /expanded size/i
  );
});
