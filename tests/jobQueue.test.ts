import assert from "node:assert/strict";
import test from "node:test";
import { parseAnalysisJob } from "../lib/jobQueue.ts";

const sessionId = `session_${"a".repeat(48)}`;
const uploadId = "b".repeat(64);
const reservationToken = "c".repeat(64);

test("analysis queue accepts only the expected runtime message shape", () => {
  assert.deepEqual(
    parseAnalysisJob(
      JSON.stringify({
        sessionId,
        userId: "user-1",
        uploadId,
        reservationToken,
        attempts: 1,
      }),
    ),
    {
      sessionId,
      userId: "user-1",
      uploadId,
      reservationToken,
      attempts: 1,
    },
  );

  assert.equal(parseAnalysisJob("not-json"), null);
  assert.equal(parseAnalysisJob(JSON.stringify({ sessionId })), null);
  assert.equal(
    parseAnalysisJob(
      JSON.stringify({
        sessionId: "../../outside",
        userId: "user-1",
        uploadId,
        reservationToken,
      }),
    ),
    null,
  );
  assert.equal(
    parseAnalysisJob(
      JSON.stringify({
        sessionId,
        userId: "user-1",
        uploadId,
        reservationToken,
        attempts: 3,
      }),
    ),
    null,
  );
  assert.equal(
    parseAnalysisJob(
      JSON.stringify({
        sessionId,
        userId: "user-1",
        uploadId: "invalid",
        reservationToken,
      }),
    ),
    null,
  );
});
