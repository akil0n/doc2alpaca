import assert from "node:assert/strict";
import test from "node:test";
import { historyAssociatedData } from "../lib/historyPrivacy.ts";
import { decryptJson, encryptJson } from "../lib/serverCrypto.ts";

const previousKey = process.env.DATA_ENCRYPTION_KEY;

test.before(() => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
});

test.after(() => {
  if (previousKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = previousKey;
});

test("history ciphertext authenticates plaintext metadata", () => {
  const metadata = {
    fileType: "json",
    itemCount: 1,
    isBatch: false,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
  };
  const encrypted = encryptJson(
    { items: [{ instruction: "q", input: "", output: "a" }] },
    historyAssociatedData("user-1", "history-1", metadata)
  );
  assert.throws(() =>
    decryptJson(
      encrypted,
      historyAssociatedData("user-1", "history-1", {
        ...metadata,
        itemCount: 999,
      })
    )
  );
});
