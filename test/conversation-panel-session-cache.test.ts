import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_PANEL_STATE } from "../web/conversation-panel-state-types";
import {
  createSessionPanelCacheKey,
  readSessionPanelCache,
  writeSessionPanelCache,
} from "../web/conversation-panel-session-cache";

test("session cache key is stable per provider and session", () => {
  assert.equal(
    createSessionPanelCacheKey("codex", "thread-1"),
    "codex:thread-1",
  );
});

test("session cache stores cloned panel state without persisting requested turn id", () => {
  const cache = new Map();
  const state = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-1",
        role: "assistant" as const,
        kind: "text" as const,
        text: "still generating",
      },
    ],
    sending: true,
    sendStatus: "Codex 正在生成...",
    threadState: {
      threadId: "thread-1",
      activeTurnId: "turn-1",
      isGenerating: true,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "inProgress" as const,
    },
  };

  writeSessionPanelCache(cache, "codex", "thread-1", state);
  state.messages.push({
    id: "msg-2",
    role: "assistant",
    kind: "text",
    text: "mutated later",
  });

  const cached = readSessionPanelCache(cache, "codex", "thread-1");
  assert.equal("requestedTurnId" in (cached ?? {}), false);
  assert.equal(cached?.state.messages.length, 1);
  assert.equal(cached?.state.threadState?.activeTurnId, "turn-1");
});
