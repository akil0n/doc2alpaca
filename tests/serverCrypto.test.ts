import assert from "node:assert/strict";
import test from "node:test";
import { decryptJson, encryptJson } from "../lib/serverCrypto.ts";

const previousKey = process.env.DATA_ENCRYPTION_KEY;
const previousSecret = process.env.AUTH_SECRET;

test.before(() => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.AUTH_SECRET = "test-secret-that-is-at-least-32-characters";
});

test.after(() => {
  if (previousKey === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = previousKey;
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});

test("encrypted JSON round-trips and is bound to its owner context", () => {
  const encrypted = encryptJson({ apiKey: "sk-private", model: "gpt-test" }, "user:1:llm");
  assert.deepEqual(decryptJson(encrypted, "user:1:llm"), {
    apiKey: "sk-private",
    model: "gpt-test",
  });
  assert.throws(() => decryptJson(encrypted, "user:2:llm"));
  assert.equal(JSON.stringify(encrypted).includes("sk-private"), false);
});

test("tampering with encrypted payload is rejected", () => {
  const encrypted = encryptJson({ answer: 42 }, "user:1:history:1");
  const bytes = Buffer.from(encrypted.ciphertext, "base64");
  bytes[0] ^= 1;
  assert.throws(() =>
    decryptJson({ ...encrypted, ciphertext: bytes.toString("base64") }, "user:1:history:1")
  );
});
