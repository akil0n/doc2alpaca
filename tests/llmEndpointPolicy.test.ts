import test from "node:test";
import assert from "node:assert/strict";
import { validateLLMBaseUrl } from "../lib/llmEndpointPolicy.ts";

const publicResolver = async () => ["104.18.33.45"];

test("LLM endpoint policy only accepts approved HTTPS hosts on public networks", async () => {
  assert.equal(
    await validateLLMBaseUrl("https://api.openai.com/v1/", {
      resolver: publicResolver,
    }),
    "https://api.openai.com/v1"
  );

  await assert.rejects(
    validateLLMBaseUrl("https://api.openai.com.evil.test/v1", {
      resolver: publicResolver,
    }),
    /approved/i
  );
  await assert.rejects(
    validateLLMBaseUrl("http://api.openai.com/v1", {
      resolver: publicResolver,
    }),
    /https/i
  );
  await assert.rejects(
    validateLLMBaseUrl("https://api.openai.com/v1", {
      resolver: async () => ["127.0.0.1"],
    }),
    /public network/i
  );
});
