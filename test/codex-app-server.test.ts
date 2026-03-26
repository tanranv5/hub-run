import assert from "node:assert/strict";
import test from "node:test";
import { shouldResumeThreadReadResult } from "../api/providers/transports/codex-app-server";

test("thread read requests a refresh when app-server returns a notLoaded snapshot", () => {
  assert.equal(
    shouldResumeThreadReadResult({
      thread: {
        status: {
          type: "notLoaded",
        },
      },
    }),
    true,
  );
});

test("thread read does not re-resume already loaded snapshots", () => {
  assert.equal(
    shouldResumeThreadReadResult({
      thread: {
        status: {
          type: "idle",
        },
      },
    }),
    false,
  );
});
