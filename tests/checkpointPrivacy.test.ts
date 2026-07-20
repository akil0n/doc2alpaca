import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("full extraction never persists source-bearing checkpoints", async () => {
  const route = await readFile("app/api/analyze/full-extract/route.ts", "utf8");
  assert.doesNotMatch(route, /saveExtractionCheckpoint|loadExtractionCheckpoint/);
  assert.match(route, /purgeExtractionCheckpoints/);
});
