import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "../api/types";
import { preloadSessionPanelCache } from "../web/conversation-panel-preload";
import {
  createSessionPanelCacheKey,
  type SessionPanelCacheEntry,
} from "../web/conversation-panel-session-cache";
import { INITIAL_PANEL_STATE } from "../web/conversation-panel-state-types";

const SESSION: SessionSummary = {
  id: "thread-1",
  display: "Selected Session",
  timestamp: 1_700_000_000_000,
  project: "/tmp/project",
  projectName: "project",
};

test("preloadSessionPanelCache writes the loaded panel state and preserves the draft", async () => {
  const loadedState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-1",
        role: "assistant" as const,
        kind: "text" as const,
        text: "预热完成后的最终状态",
      },
    ],
    threadState: {
      threadId: SESSION.id,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "completed" as const,
    },
  };
  const cache = new Map<string, SessionPanelCacheEntry>([
    [
      createSessionPanelCacheKey("codex", SESSION.id),
      {
        draft: "不要把我冲掉",
        state: INITIAL_PANEL_STATE,
      },
    ],
  ]);

  await preloadSessionPanelCache({
    cache,
    loadPage: async () => loadedState,
    providerId: "codex",
    session: SESSION,
  });

  assert.deepEqual(
    cache.get(createSessionPanelCacheKey("codex", SESSION.id)),
    {
      draft: "不要把我冲掉",
      skipReloadOnce: true,
      state: loadedState,
    },
  );
});

test("preloadSessionPanelCache ignores draft sessions", async () => {
  const cache = new Map<string, SessionPanelCacheEntry>();
  let loadPageCalled = false;

  await preloadSessionPanelCache({
    cache,
    loadPage: async () => {
      loadPageCalled = true;
      return INITIAL_PANEL_STATE;
    },
    providerId: "codex",
    session: {
      ...SESSION,
      id: "draft:/tmp/project",
      isDraft: true,
    },
  });

  assert.equal(loadPageCalled, false);
  assert.equal(cache.size, 0);
});
