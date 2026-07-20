import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("build and server startup purge legacy source-bearing checkpoints", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.scripts.prebuild, "node scripts/purge-sensitive-temp.js");
  assert.equal(packageJson.scripts.prestart, "node scripts/purge-sensitive-temp.js");
  const purgeScript = await readFile("scripts/purge-sensitive-temp.js", "utf8");
  assert.match(purgeScript, /extraction-sessions/);
});

test("missing provider token usage retains the reserved budget", async () => {
  const quota = await readFile("lib/llmQuota.ts", "utf8");
  assert.match(quota, /Missing provider usage.*retain the conservative reservation/);
  assert.match(quota, /releaseLlmReservation/);
});
