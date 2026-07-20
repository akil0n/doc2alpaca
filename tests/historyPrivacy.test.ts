import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeGeneratedItems,
  historyAssociatedData,
} from "../lib/historyPrivacy.ts";

test("history keeps only Alpaca output fields and strips source excerpts", () => {
  const items = canonicalizeGeneratedItems([
    {
      instruction: "问",
      input: "",
      output: "答",
      source: { fileName: "secret.pdf", text: "verbatim original document" },
      reviewStatus: "accepted",
    },
  ]);
  assert.deepEqual(items, [{ instruction: "问", input: "", output: "答" }]);
  assert.equal(JSON.stringify(items).includes("verbatim original"), false);
  assert.equal(JSON.stringify(items).includes("secret.pdf"), false);
});

test("history authentication context includes every plaintext metadata field", () => {
  const aad = historyAssociatedData("user-1", "history-1", {
    fileType: "json",
    itemCount: 3,
    isBatch: false,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
  });
  assert.match(aad, /"itemCount":3/);
  assert.match(aad, /2026-07-20T00:00:00.000Z/);
});
