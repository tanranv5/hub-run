import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SessionSummary } from "../api/types";
import { bootstrapConversationPanel } from "../web/conversation-panel-bootstrap";
import { appendOptimisticUserMessage } from "../web/conversation-panel-state-helpers";
import { beginPanelSendLifecycle } from "../web/conversation-panel-send";
import {
  createSessionPanelCacheKey,
  type SessionPanelCacheEntry,
} from "../web/conversation-panel-session-cache";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
} from "../web/conversation-panel-state-types";

const SESSION: SessionSummary = {
  id: "thread-1",
  display: "Cached Session",
  timestamp: 1_700_000_000_000,
  project: "/tmp/project",
  projectName: "project",
};

function createPanelStateStore(initial: PanelState) {
  let value = initial;
  const setValue: Dispatch<SetStateAction<PanelState>> = (next) => {
    value = typeof next === "function" ? next(value) : next;
  };
  return {
    read: () => value,
    setValue,
  };
}

function createStringStore(initial: string) {
  let value = initial;
  const setValue: Dispatch<SetStateAction<string>> = (next) => {
    value = typeof next === "function" ? next(value) : next;
  };
  return {
    read: () => value,
    setValue,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test("bootstrapConversationPanel keeps optimistic send state when the initial reload returns stale messages", async () => {
  const cachedState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-old",
        role: "assistant",
        kind: "text",
        text: "这是缓存中的旧消息",
      },
    ],
  };
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const generationRef = { current: 0 } as MutableRefObject<number>;
  const previousSessionRef = { current: null } as MutableRefObject<{
    providerId: "codex" | "claude";
    sessionId: string;
  } | null>;
  const stateRef = { current: INITIAL_PANEL_STATE } as MutableRefObject<PanelState>;
  let loadPageArgCount = 0;
  const sessionCacheRef = {
    current: new Map<string, SessionPanelCacheEntry>([
      [
        createSessionPanelCacheKey("codex", SESSION.id),
        {
          state: cachedState,
        },
      ],
    ]),
  } as MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  const deferred = createDeferred<PanelState>();

  bootstrapConversationPanel({
    generationRef,
    loadPage: async (...args) => {
      loadPageArgCount = args.length;
      return deferred.promise;
    },
    previousSessionRef,
    providerId: "codex",
    session: SESSION,
    sessionCacheRef,
    setState: stateStore.setValue,
    stateRef,
  });

  assert.deepEqual(stateStore.read(), cachedState);
  assert.equal(loadPageArgCount, 2);
  const optimisticState = beginPanelSendLifecycle(
    {
      ...stateStore.read(),
      messages: appendOptimisticUserMessage(
        stateStore.read().messages,
        "刚刚补发的一条消息",
        2_000,
      ),
    },
    "codex",
    SESSION.id,
    2_000,
  );
  stateStore.setValue(optimisticState);
  stateRef.current = optimisticState;

  deferred.resolve({
    ...INITIAL_PANEL_STATE,
    messages: cachedState.messages,
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(stateStore.read().messages.length, 2);
  assert.equal(stateStore.read().messages[1]?.text, "刚刚补发的一条消息");
  assert.equal(stateStore.read().sendLifecycle?.phase, "submitted");
});

test("bootstrapConversationPanel scopes composer drafts per session and restores cached draft", async () => {
  const otherSession: SessionSummary = {
    ...SESSION,
    id: "thread-2",
    display: "Other Session",
  };
  const draftStore = createStringStore("这条旧草稿不该串到新会话");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const generationRef = { current: 0 } as MutableRefObject<number>;
  const previousSessionRef = {
    current: {
      providerId: "codex" as const,
      sessionId: SESSION.id,
    },
  } as MutableRefObject<{
    providerId: "codex" | "claude";
    sessionId: string;
  } | null>;
  const stateRef = { current: INITIAL_PANEL_STATE } as MutableRefObject<PanelState>;
  const draftRef = { current: draftStore.read() } as MutableRefObject<string>;
  const sessionCacheRef = {
    current: new Map<string, SessionPanelCacheEntry>(),
  } as MutableRefObject<Map<string, SessionPanelCacheEntry>>;

  bootstrapConversationPanel({
    generationRef,
    loadPage: async () => INITIAL_PANEL_STATE,
    previousSessionRef,
    providerId: "codex",
    session: otherSession,
    sessionCacheRef,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    stateRef,
    draftRef,
  });

  assert.equal(draftStore.read(), "");
  assert.equal(
    sessionCacheRef.current.get(createSessionPanelCacheKey("codex", SESSION.id))
      ?.draft,
    "这条旧草稿不该串到新会话",
  );

  draftStore.setValue("thread-2 的本地草稿");
  draftRef.current = draftStore.read();
  stateRef.current = stateStore.read();

  bootstrapConversationPanel({
    generationRef,
    loadPage: async () => INITIAL_PANEL_STATE,
    previousSessionRef,
    providerId: "codex",
    session: SESSION,
    sessionCacheRef,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    stateRef,
    draftRef,
  });

  assert.equal(draftStore.read(), "这条旧草稿不该串到新会话");
});

test("bootstrapConversationPanel skips the immediate reload when the session was preloaded", () => {
  const cachedState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-preloaded",
        role: "assistant",
        kind: "text",
        text: "这是预热好的首屏状态",
      },
    ],
    threadState: {
      threadId: SESSION.id,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "completed",
    },
  };
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const generationRef = { current: 0 } as MutableRefObject<number>;
  const previousSessionRef = { current: null } as MutableRefObject<{
    providerId: "codex" | "claude";
    sessionId: string;
  } | null>;
  const stateRef = { current: INITIAL_PANEL_STATE } as MutableRefObject<PanelState>;
  const sessionCacheRef = {
    current: new Map<string, SessionPanelCacheEntry>([
      [
        createSessionPanelCacheKey("codex", SESSION.id),
        {
          skipReloadOnce: true,
          state: cachedState,
        },
      ],
    ]),
  } as MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  let loadPageCalled = false;

  bootstrapConversationPanel({
    generationRef,
    loadPage: async () => {
      loadPageCalled = true;
      return INITIAL_PANEL_STATE;
    },
    previousSessionRef,
    providerId: "codex",
    session: SESSION,
    sessionCacheRef,
    setState: stateStore.setValue,
    stateRef,
  });

  assert.equal(loadPageCalled, false);
  assert.deepEqual(stateStore.read(), cachedState);
  assert.equal(
    sessionCacheRef.current.get(createSessionPanelCacheKey("codex", SESSION.id))
      ?.skipReloadOnce,
    false,
  );
});
