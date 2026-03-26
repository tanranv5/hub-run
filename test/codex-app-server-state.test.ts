import assert from "node:assert/strict";
import test from "node:test";
import { buildThreadState } from "../api/providers/transports/codex-app-server-state";

test("buildThreadState falls back to the latest completed turn when no requested turn id is provided", () => {
  const state = buildThreadState("thread-1", {
    thread: {
      turns: [
        { id: "turn-1", status: "completed" },
        { id: "turn-2", status: "completed" },
      ],
    },
  });

  assert.deepEqual(state, {
    threadId: "thread-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-2",
    requestedTurnStatus: "completed",
  });
});

test("buildThreadState falls back to the active turn when the latest turn is still generating", () => {
  const state = buildThreadState("thread-1", {
    thread: {
      turns: [
        { id: "turn-1", status: "completed" },
        { id: "turn-2", status: "inProgress" },
      ],
    },
  });

  assert.deepEqual(state, {
    threadId: "thread-1",
    activeTurnId: "turn-2",
    isGenerating: true,
    requestedTurnId: "turn-2",
    requestedTurnStatus: "inProgress",
  });
});

test("buildThreadState keeps explicit requested turn id lookup when one is provided", () => {
  const state = buildThreadState(
    "thread-1",
    {
      thread: {
        turns: [
          { id: "turn-1", status: "completed" },
          { id: "turn-2", status: "failed" },
        ],
      },
    },
    "turn-1",
  );

  assert.deepEqual(state, {
    threadId: "thread-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-1",
    requestedTurnStatus: "completed",
  });
});
