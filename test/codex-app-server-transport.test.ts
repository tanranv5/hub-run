import assert from "node:assert/strict";
import test from "node:test";
import { resolveInterruptTurnId } from "../api/providers/transports/codex-app-server";

test("resolveInterruptTurnId prefers active turn ids", () => {
  assert.equal(
    resolveInterruptTurnId({
      threadId: "thread-1",
      activeTurnId: "turn-active",
      isGenerating: true,
      requestedTurnId: "turn-requested",
      requestedTurnStatus: "inProgress",
    }),
    "turn-active",
  );
});

test("resolveInterruptTurnId falls back to the requested turn for stalled sessions", () => {
  assert.equal(
    resolveInterruptTurnId({
      threadId: "thread-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-stalled",
      requestedTurnStatus: null,
      stalled: true,
      stallReason: "noRecentActivity",
    }),
    "turn-stalled",
  );
});

test("resolveInterruptTurnId can still target accepted turns before app-server marks them active", () => {
  assert.equal(
    resolveInterruptTurnId({
      threadId: "thread-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-accepted",
      requestedTurnStatus: null,
    }),
    "turn-accepted",
  );
});

test("resolveInterruptTurnId stays empty for settled non-stalled sessions", () => {
  assert.equal(
    resolveInterruptTurnId({
      threadId: "thread-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-done",
      requestedTurnStatus: "completed",
    }),
    null,
  );
});
