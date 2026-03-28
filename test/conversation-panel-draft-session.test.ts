import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SessionSummary } from "../api/types";
import { bootstrapConversationPanel } from "../web/conversation-panel-bootstrap";
import {
  createSessionPanelCacheKey,
  type SessionPanelCacheEntry,
} from "../web/conversation-panel-session-cache";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
} from "../web/conversation-panel-state-types";

const DRAFT_SESSION: SessionSummary = {
  id: "draft:thread-1",
  isDraft: true,
  display: "新会话",
  timestamp: 1_700_000_000_000,
  project: "/tmp/project",
  projectName: "project",
};

const REAL_SESSION: SessionSummary = {
  id: "thread-real",
  display: "真实会话",
  timestamp: 1_700_000_000_001,
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

test("bootstrapConversationPanel restores cached draft for draft sessions", () => {
  const draftStore = createStringStore("");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const generationRef = { current: 0 } as MutableRefObject<number>;
  const previousSessionRef = { current: null } as MutableRefObject<{
    providerId: "codex" | "claude";
    sessionId: string;
  } | null>;
  const stateRef = { current: INITIAL_PANEL_STATE } as MutableRefObject<PanelState>;
  const draftRef = { current: draftStore.read() } as MutableRefObject<string>;
  const sessionCacheRef = {
    current: new Map<string, SessionPanelCacheEntry>([
      [
        createSessionPanelCacheKey("codex", DRAFT_SESSION.id),
        {
          draft: "这段新会话草稿应该回来",
          state: INITIAL_PANEL_STATE,
        },
      ],
    ]),
  } as MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  let loadPageCalled = false;

  bootstrapConversationPanel({
    draftRef,
    generationRef,
    loadPage: async () => {
      loadPageCalled = true;
      return INITIAL_PANEL_STATE;
    },
    previousSessionRef,
    providerId: "codex",
    session: DRAFT_SESSION,
    sessionCacheRef,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    stateRef,
  });

  assert.equal(loadPageCalled, false);
  assert.equal(draftStore.read(), "这段新会话草稿应该回来");
  assert.equal(previousSessionRef.current?.sessionId, DRAFT_SESSION.id);
});

test("bootstrapConversationPanel caches draft-session composer text when switching away", () => {
  const draftStore = createStringStore("切走再回来也不能丢");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const generationRef = { current: 0 } as MutableRefObject<number>;
  const previousSessionRef = {
    current: {
      providerId: "codex" as const,
      sessionId: DRAFT_SESSION.id,
    },
  } as MutableRefObject<{
    providerId: "codex" | "claude";
    sessionId: string;
  } | null>;
  const stateRef = { current: stateStore.read() } as MutableRefObject<PanelState>;
  const draftRef = { current: draftStore.read() } as MutableRefObject<string>;
  const sessionCacheRef = {
    current: new Map<string, SessionPanelCacheEntry>(),
  } as MutableRefObject<Map<string, SessionPanelCacheEntry>>;

  bootstrapConversationPanel({
    draftRef,
    generationRef,
    loadPage: async () => INITIAL_PANEL_STATE,
    previousSessionRef,
    providerId: "codex",
    session: REAL_SESSION,
    sessionCacheRef,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    stateRef,
  });

  assert.equal(
    sessionCacheRef.current.get(createSessionPanelCacheKey("codex", DRAFT_SESSION.id))
      ?.draft,
    "切走再回来也不能丢",
  );
});
