import assert from "node:assert/strict";
import test from "node:test";
import { applySessionPanelUpdate } from "../web/conversation-panel-session-sync";
import {
  createSessionPanelCacheKey,
  type SessionPanelCacheEntry,
} from "../web/conversation-panel-session-cache";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
} from "../web/conversation-panel-state-types";

test("applySessionPanelUpdate writes cache and updates the active panel snapshot", () => {
  const cache = new Map<string, SessionPanelCacheEntry>();
  const currentState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-1",
        role: "assistant",
        kind: "text",
        text: "当前面板里已有消息",
      },
    ],
  };

  const result = applySessionPanelUpdate({
    activeProviderId: "codex",
    activeSessionId: "thread-1",
    cache,
    currentDraft: "",
    currentState,
    providerId: "codex",
    sessionId: "thread-1",
    update: {
      updateState: (state) => ({
        ...state,
        error: "late accepted update",
      }),
    },
  });

  assert.equal(result.isActive, true);
  assert.equal(result.nextState.error, "late accepted update");
  assert.equal(
    "requestedTurnId" in (cache.get(createSessionPanelCacheKey("codex", "thread-1")) ?? {}),
    false,
  );
});

test("applySessionPanelUpdate falls back to cached session snapshot when target session is inactive", () => {
  const cachedState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-1",
        role: "user",
        kind: "message",
        text: "旧会话中的草稿消息",
      },
    ],
  };
  const cache = new Map<string, SessionPanelCacheEntry>([
    [
      createSessionPanelCacheKey("codex", "thread-1"),
      {
        draft: "旧草稿",
        state: cachedState,
      },
    ],
  ]);

  const result = applySessionPanelUpdate({
    activeProviderId: "codex",
    activeSessionId: "thread-2",
    cache,
    currentDraft: "",
    currentState: INITIAL_PANEL_STATE,
    providerId: "codex",
    sessionId: "thread-1",
    update: {
      draft: "恢复后的草稿",
      updateState: (state) => ({
        ...state,
        error: "late failure",
      }),
    },
  });

  assert.equal(result.isActive, false);
  assert.equal(result.nextDraft, "恢复后的草稿");
  assert.equal(result.nextState.error, "late failure");
  assert.equal(
    cache.get(createSessionPanelCacheKey("codex", "thread-1"))?.draft,
    "恢复后的草稿",
  );
});
