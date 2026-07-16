import assert from "node:assert/strict";
import test from "node:test";

import { createQARecord } from "../lib/qaPipeline.ts";

test("生成的问答记录可追溯到原文并带有真实质量评估", () => {
  const record = createQARecord(
    {
      instruction: "项目支持哪些文档格式？",
      input: "",
      output: "项目支持 PDF、Word、PowerPoint、TXT、Markdown 和 HTML。",
    },
    {
      documentId: "doc-1",
      fileName: "说明书.md",
      fileType: "md",
      chunkId: "chunk_001",
      heading: "支持格式",
      startOffset: 10,
      endOffset: 80,
      text: "项目支持 PDF、Word、PowerPoint、TXT、Markdown 和 HTML 文档。",
    }
  );

  assert.match(record.id, /^qa_/);
  assert.equal(record.source.chunkId, "chunk_001");
  assert.equal(record.reviewStatus, "pending");
  assert.ok(record.quality.groundedness >= 0.75);
  assert.ok(record.quality.overall >= 0 && record.quality.overall <= 1);
});
