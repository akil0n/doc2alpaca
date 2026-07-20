import test from "node:test";
import assert from "node:assert/strict";
import { validateLLMBaseUrl } from "../lib/llmEndpointPolicy.ts";

test("public LLM endpoints cannot select a non-standard port", async () => {
  await assert.rejects(
    validateLLMBaseUrl("https://api.openai.com:8443/v1", {
      resolver: async () => ["104.18.33.45"],
    }),
    /port/i
  );
});
