import assert from "node:assert/strict";
import test from "node:test";

import { chunkStructuredDocument } from "../lib/documentChunker.ts";

test("结构化分块保留标题前言、正确偏移并覆盖相邻知识边界", () => {
  const text = [
    "这是文档前言，必须保留。",
    "",
    "# 第一章",
    "重复段落。重复段落。这里介绍配置方法和必要参数。",
    "",
    "# 第二章",
    "重复段落。重复段落。这里介绍导出格式和审核流程。",
  ].join("\n");

  const chunks = chunkStructuredDocument(text, { maxChars: 42, overlapChars: 10 });

  assert.ok(chunks.some((chunk) => chunk.text.includes("文档前言")));
  assert.ok(chunks.every((chunk) => text.slice(chunk.startOffset, chunk.endOffset).includes(chunk.text.trim())));
  assert.ok(chunks.every((chunk) => chunk.total === chunks.length));
  assert.ok(chunks.some((chunk) => chunk.heading === "第一章"));
  assert.ok(chunks.some((chunk) => chunk.heading === "第二章"));
});
