import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionId,
  getSessionDir,
  sessionBelongsTo,
} from "../lib/sessionManager.ts";
import type { SessionMeta } from "../types/index.ts";
import { createHash } from "node:crypto";

test("deep-session ids are high entropy and cannot traverse the filesystem", () => {
  const sessionId = createSessionId();
  assert.match(sessionId, /^session_[a-f0-9]{48}$/);
  assert.throws(() => getSessionDir("../../outside"), /无效的会话标识/);
});

test("deep-session progress is bound to the anonymous browser owner", () => {
  const ownerToken = "owner-a";
  const meta = {
    ownerHash: createHash("sha256").update(ownerToken).digest("hex"),
  } as SessionMeta;

  assert.equal(sessionBelongsTo(meta, ownerToken), true);
  assert.equal(sessionBelongsTo(meta, "owner-b"), false);
});
