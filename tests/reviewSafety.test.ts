import test from "node:test";
import assert from "node:assert/strict";
import { chunkStructuredDocument } from "../lib/documentChunker.ts";
import { isCheckpointCompatible, type ExtractionCheckpoint } from "../lib/extractionCheckpoint.ts";
import { deduplicateQARecords, recordSimilarity } from "../lib/qaDeduplication.ts";
import { createQARecord } from "../lib/qaPipeline.ts";

function record(instruction: string, index: number) {
  return createQARecord(
    { instruction, input: "", output: "same answer" },
    {
      documentId: "doc",
      fileName: "source.md",
      fileType: "md",
      chunkId: `chunk_${index}`,
      startOffset: index,
      endOffset: index + 20,
      text: `${instruction} same answer`,
      available: true,
    },
    { createdAt: index }
  );
}

test("checkpoint resume requires the exact content/config fingerprint", () => {
  const checkpoint: ExtractionCheckpoint = {
    sessionId: "session",
    fingerprint: "document-a-config-v1",
    schemaVersion: 1,
    sourceName: "a.md",
    completedChunkIds: ["chunk_001"],
    items: [],
    updatedAt: 1,
  };
  assert.equal(isCheckpointCompatible(checkpoint, "document-a-config-v1"), true);
  assert.equal(isCheckpointCompatible(checkpoint, "document-b-config-v1"), false);
});

test("section overlap never borrows text from a previous heading", () => {
  const text = "# Alpha\nalpha-only evidence\n# Beta\nbeta-only evidence";
  const chunks = chunkStructuredDocument(text, { maxChars: 40, overlapChars: 12 });
  const beta = chunks.find((chunk) => chunk.heading === "Beta");
  assert.ok(beta);
  assert.equal(beta.text.includes("alpha-only"), false);
});

test("dedup does not remove a transitive-only neighbour", () => {
  const a = record("abcdefg", 1);
  const b = record("abcdxyz", 2);
  const c = record("xyzduvw", 3);
  assert.ok(recordSimilarity(a, b) >= 0.5);
  assert.ok(recordSimilarity(b, c) >= 0.5);
  assert.ok(recordSimilarity(a, c) < 0.5);

  const result = deduplicateQARecords([a, b, c], { threshold: 0.5 });
  assert.equal(result.items.length, 2);
  assert.ok(result.items.some((item) => item.id === a.id));
  assert.ok(result.items.some((item) => item.id === c.id));
});

test("legacy records report unavailable evidence instead of fabricated groundedness", () => {
  const item = createQARecord(
    { instruction: "历史问题是什么？", input: "", output: "历史答案" },
    {
      documentId: "legacy",
      fileName: "历史数据",
      fileType: "txt",
      chunkId: "legacy_1",
      startOffset: 0,
      endOffset: 0,
      text: "",
      available: false,
    }
  );
  assert.equal(item.quality.evidenceAvailable, false);
  assert.equal(item.quality.groundedness, 0);
  assert.ok(item.quality.flags.some((flag) => flag.includes("证据不可用")));
});
