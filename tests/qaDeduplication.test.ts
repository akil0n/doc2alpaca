import assert from "node:assert/strict";
import test from "node:test";

import { deduplicateQARecords } from "../lib/qaDeduplication.ts";
import type { QARecord } from "../lib/qaPipeline.ts";

test("近义问题形成可审计重复组并保留质量更高的记录", () => {
  const weak = makeRecord("weak", "模型要怎样设置？", "打开配置页后填写若干信息即可。", 0.58);
  const strong = makeRecord("strong", "如何配置模型？", "打开配置页，填写 API Key、Base URL 和模型名称。", 0.93);

  const result = deduplicateQARecords([weak, strong], { threshold: 0.72 });

  assert.deepEqual(result.items.map((item) => item.id), ["strong"]);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].keptId, "strong");
  assert.deepEqual(result.groups[0].duplicateIds, ["weak"]);
});

function makeRecord(id: string, instruction: string, output: string, overall: number): QARecord {
  return {
    id,
    instruction,
    input: "",
    output,
    reviewStatus: "pending",
    taskType: "closed_book_qa",
    createdAt: 1,
    quality: {
      groundedness: overall,
      completeness: overall,
      clarity: overall,
      relevance: overall,
      overall,
      flags: [],
    },
    source: {
      documentId: "doc",
      fileName: "文档.md",
      fileType: "md",
      chunkId: id,
      startOffset: 0,
      endOffset: output.length,
      text: output,
    },
  };
}
