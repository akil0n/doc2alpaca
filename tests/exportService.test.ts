import assert from "node:assert/strict";
import test from "node:test";

import { formatJson } from "../lib/exportService.ts";
import type { QARecord } from "../lib/qaPipeline.ts";

test("受审核数据集只导出已接受记录且不泄露内部元数据", () => {
  const accepted = record("accepted", "已接受");
  const pending = record("pending", "待审核");
  const output = JSON.parse(formatJson([accepted, pending], "alpaca"));

  assert.equal(output.length, 1);
  assert.deepEqual(Object.keys(output[0]), ["instruction", "input", "output"]);
  assert.equal(output[0].instruction, "已接受");
});

function record(reviewStatus: QARecord["reviewStatus"], instruction: string): QARecord {
  return {
    id: instruction,
    instruction,
    input: "",
    output: "答案",
    reviewStatus,
    taskType: "closed_book_qa",
    createdAt: 1,
    quality: { groundedness: 1, completeness: 1, clarity: 1, relevance: 1, overall: 1, flags: [] },
    source: { documentId: "d", fileName: "f", fileType: "txt", chunkId: "c", startOffset: 0, endOffset: 2, text: "答案" },
  };
}
