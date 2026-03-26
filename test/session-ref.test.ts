import test from "node:test";
import assert from "node:assert/strict";
import { decodeSessionKey, encodeSessionKey } from "../api/session-ref";
import type { SessionRef } from "../api/types";

test("sessionKey round-trip preserves provider session reference", () => {
  const ref: SessionRef = {
    providerId: "codex",
    sessionId: "session-123",
    projectPath: "/tmp/project",
  };

  const key = encodeSessionKey(ref);
  const decoded = decodeSessionKey(key);

  assert.equal(typeof key, "string");
  assert.equal(key.length > 10, true);
  assert.deepEqual(decoded, ref);
});

test("decodeSessionKey rejects malformed payload", () => {
  assert.throws(() => decodeSessionKey("bad-key"));
});
