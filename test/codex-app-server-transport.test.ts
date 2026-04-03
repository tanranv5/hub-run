import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexTurnInput,
  resolveInterruptTurnId,
} from "../api/providers/transports/codex-app-server";

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

test("buildCodexTurnInput combines optional text and images into app-server user input items", () => {
  assert.deepEqual(
    buildCodexTurnInput({
      images: [{
        name: "error.png",
        url: "data:image/png;base64,AAAA",
      }],
      text: "帮我看下这张图",
    }),
    [
      { type: "text", text: "帮我看下这张图", text_elements: [] },
      { type: "image", url: "data:image/png;base64,AAAA" },
    ],
  );
});
