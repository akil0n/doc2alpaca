import assert from "node:assert/strict";
import test from "node:test";

import { QuestionSearchIndex } from "../lib/questionSearch.ts";
import type { QARecord } from "../lib/qaPipeline.ts";

const records = [
  makeRecord("qa_1", "如何配置模型？", "在右上角打开配置面板。", "设置", "accepted"),
  makeRecord("qa_2", "支持哪些文件？", "支持 PDF 和 Word。", "格式", "pending"),
  makeRecord("qa_3", "怎样设置大语言模型？", "填写密钥、地址和模型名。", "设置", "pending"),
];

test("问题检索综合匹配问题、答案、章节并支持审核状态过滤", () => {
  const index = new QuestionSearchIndex(records);
  const results = index.search({ query: "模型设置步骤", mode: "hybrid", limit: 10 });

  assert.equal(results.length, 2);
  assert.deepEqual(new Set(results.map((item) => item.record.id)), new Set(["qa_1", "qa_3"]));
  assert.ok(results[0].score > 0);

  const accepted = index.search({ query: "模型", reviewStatuses: ["accepted"], limit: 10 });
  assert.deepEqual(accepted.map((item) => item.record.id), ["qa_1"]);
});

function makeRecord(
  id: string,
  instruction: string,
  output: string,
  heading: string,
  reviewStatus: QARecord["reviewStatus"]
): QARecord {
  return {
    id,
    instruction,
    input: "",
    output,
    reviewStatus,
    taskType: "closed_book_qa",
    createdAt: 1,
    quality: {
      groundedness: 0.9,
      completeness: 0.9,
      clarity: 0.9,
      relevance: 0.9,
      overall: 0.9,
      flags: [],
    },
    source: {
      documentId: "doc",
      fileName: "说明.md",
      fileType: "md",
      chunkId: id,
      heading,
      startOffset: 0,
      endOffset: output.length,
      text: output,
    },
  };
}
