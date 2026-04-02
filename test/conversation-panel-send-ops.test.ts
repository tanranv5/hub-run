import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, SetStateAction } from "react";
import type { SessionSummary } from "../api/types";
import { createDraftSession } from "../web/draft-session";
import { sendConversation } from "../web/conversation-panel-send-ops";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
  type SendConversationResult,
} from "../web/conversation-panel-state-types";

const SESSION: SessionSummary = {
  id: "thread-1",
  display: "Test Session",
  timestamp: 1_700_000_000_000,
  project: "/tmp/project",
  projectName: "project",
};

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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("optimistic codex send clears composer immediately after the message is shown", async () => {
  const draftStore = createStringStore("请帮我看下发送卡顿");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const deferred = createDeferred<SendConversationResult>();

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => {},
    onSendMessage: async () => deferred.promise,
    providerId: "codex",
    session: SESSION,
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => false,
  });

  await Promise.resolve();

  assert.equal(draftStore.read(), "");
  assert.equal(stateStore.read().messages.length, 1);
  assert.equal(stateStore.read().messages[0]?.text, "请帮我看下发送卡顿");
  assert.equal(stateStore.read().sendLifecycle?.phase, "submitted");

  deferred.resolve({
    sessionId: SESSION.id,
    turnId: "turn-1",
    outputText: null,
  });
  await pending;
});

test("failed optimistic send restores the composer draft after rolling back the fake message", async () => {
  const draftStore = createStringStore("这条失败后要恢复");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const deferred = createDeferred<SendConversationResult>();

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => {},
    onSendMessage: async () => deferred.promise,
    providerId: "codex",
    session: SESSION,
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => false,
  });

  await Promise.resolve();
  assert.equal(draftStore.read(), "");
  assert.equal(stateStore.read().messages.length, 1);

  deferred.reject(new Error("network exploded"));
  await pending;

  assert.equal(draftStore.read(), "这条失败后要恢复");
  assert.equal(stateStore.read().messages.length, 0);
  assert.match(stateStore.read().error ?? "", /network exploded/);
});

test("accepted send does not roll back when sidebar refresh fails afterwards", async () => {
  const text = "这条消息其实已经发出去了";
  const draftStore = createStringStore(text);
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);

  await sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => {
      throw new Error("sidebar refresh exploded");
    },
    onSendMessage: async () => ({
      sessionId: SESSION.id,
      turnId: "turn-2",
      outputText: null,
    }),
    providerId: "codex",
    session: SESSION,
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => false,
  });

  assert.equal(draftStore.read(), "");
  assert.equal(stateStore.read().messages.length, 1);
  assert.equal(stateStore.read().messages[0]?.text, text);
  assert.equal(stateStore.read().sendLifecycle?.phase, "accepted");
  assert.match(stateStore.read().error ?? "", /sidebar refresh exploded/);
});

test("failed send ignores rollback when the request was aborted by a session switch", async () => {
  const draftStore = createStringStore("这条旧会话消息不该回滚到新会话");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const deferred = createDeferred<SendConversationResult>();
  let aborted = false;

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => {},
    onSendMessage: async () => deferred.promise,
    providerId: "codex",
    session: SESSION,
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => aborted,
  });

  await Promise.resolve();
  const replacementState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-new",
        role: "assistant",
        kind: "text",
        text: "这是新的会话状态",
      },
    ],
  };
  stateStore.setValue(replacementState);
  aborted = true;
  deferred.reject(new Error("old session exploded"));

  await pending;

  assert.deepEqual(stateStore.read(), replacementState);
  assert.equal(draftStore.read(), "");
});

test("accepted send ignores a late sync failure after the session changed", async () => {
  const draftStore = createStringStore("这条消息已经被接受");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const sidebarDeferred = createDeferred<void>();
  let aborted = false;

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => sidebarDeferred.promise,
    onSendMessage: async () => ({
      sessionId: SESSION.id,
      turnId: "turn-accepted",
      outputText: null,
    }),
    providerId: "codex",
    session: SESSION,
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => aborted,
  });

  await Promise.resolve();
  const replacementState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-newer",
        role: "assistant",
        kind: "text",
        text: "这里已经切到别的会话了",
      },
    ],
  };
  stateStore.setValue(replacementState);
  aborted = true;
  sidebarDeferred.reject(new Error("late sidebar failure"));

  await pending;

  assert.deepEqual(stateStore.read(), replacementState);
});

test("draft send keeps current panel state visible until the real session finishes loading", async () => {
  const draftStore = createStringStore("从 draft 首次发送");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const sidebarDeferred = createDeferred<void>();
  let capturedSessionId: string | null = null;
  let capturedInitialDisplay: string | null = null;

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async (sessionId, initialDisplay) => {
      capturedSessionId = sessionId;
      capturedInitialDisplay = initialDisplay ?? null;
      return sidebarDeferred.promise;
    },
    onSendMessage: async () => ({
      sessionId: "thread-real-1",
      turnId: "turn-draft-1",
      outputText: null,
    }),
    providerId: "codex",
    session: createDraftSession("/tmp/project", 1_700_000_000_001),
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => false,
  });

  await Promise.resolve();

  assert.equal(stateStore.read().messages.length, 1);
  assert.equal(stateStore.read().messages[0]?.text, "从 draft 首次发送");
  assert.equal(stateStore.read().sendLifecycle?.phase, "accepted");
  assert.equal(capturedSessionId, "thread-real-1");
  assert.equal(capturedInitialDisplay, "从 draft 首次发送");

  sidebarDeferred.resolve();
  await pending;
});

test("draft send seeds the real session cache with immediate Claude output before switching", async () => {
  const draftStore = createStringStore("从 draft 首次发送");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const detachedStateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const sidebarDeferred = createDeferred<void>();
  let capturedSessionId: string | null = null;

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => sidebarDeferred.promise,
    onSendMessage: async () => ({
      sessionId: "claude-session-real-1",
      turnId: null,
      outputText: "Claude 首条回复",
    }),
    providerId: "claude",
    session: createDraftSession("/tmp/project", 1_700_000_000_001),
    streamAvailable: false,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => false,
    updateDetachedSession: (update) => {
      capturedSessionId = update.sessionId ?? null;
      if (update.updateState) {
        detachedStateStore.setValue(update.updateState);
      }
    },
  });

  await Promise.resolve();

  assert.equal(capturedSessionId, "claude-session-real-1");
  assert.deepEqual(
    detachedStateStore.read().messages.map((message) => message.text),
    ["从 draft 首次发送", "Claude 首条回复"],
  );
  assert.equal(detachedStateStore.read().sendLifecycle?.phase, "completed");

  sidebarDeferred.resolve();
  await pending;
});

test("late accepted send updates the original session snapshot after a session switch", async () => {
  const draftStore = createStringStore("这条旧会话消息还在处理中");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const detachedStateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const detachedDraftStore = createStringStore("");
  const deferred = createDeferred<SendConversationResult>();
  let aborted = false;

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => {},
    onSendMessage: async () => deferred.promise,
    providerId: "codex",
    session: SESSION,
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => aborted,
    updateDetachedSession: (update) => {
      if (update.draft !== undefined) {
        detachedDraftStore.setValue(update.draft);
      }
      if (update.updateState) {
        detachedStateStore.setValue(update.updateState);
      }
    },
  });

  await Promise.resolve();

  detachedStateStore.setValue(stateStore.read());
  const replacementState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-newer",
        role: "assistant",
        kind: "text",
        text: "这里已经切到别的会话了",
      },
    ],
  };
  stateStore.setValue(replacementState);
  aborted = true;
  deferred.resolve({
    sessionId: SESSION.id,
    turnId: "turn-late",
    outputText: null,
  });

  await pending;

  assert.deepEqual(stateStore.read(), replacementState);
  assert.equal(detachedStateStore.read().sendLifecycle?.phase, "accepted");
  assert.equal(detachedStateStore.read().sending, true);
});

test("late failed send restores the original session draft after a session switch", async () => {
  const text = "这条旧会话失败后也要恢复";
  const draftStore = createStringStore(text);
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const detachedStateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const detachedDraftStore = createStringStore("");
  const deferred = createDeferred<SendConversationResult>();
  let aborted = false;

  const pending = sendConversation({
    draft: draftStore.read(),
    onMessageSent: async () => {},
    onSendMessage: async () => deferred.promise,
    providerId: "codex",
    session: SESSION,
    streamAvailable: true,
    setDraft: draftStore.setValue,
    setState: stateStore.setValue,
    shouldAbort: () => aborted,
    updateDetachedSession: (update) => {
      if (update.draft !== undefined) {
        detachedDraftStore.setValue(update.draft);
      }
      if (update.updateState) {
        detachedStateStore.setValue(update.updateState);
      }
    },
  });

  await Promise.resolve();

  detachedStateStore.setValue(stateStore.read());
  const replacementState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-newer",
        role: "assistant",
        kind: "text",
        text: "这里已经切到别的会话了",
      },
    ],
  };
  stateStore.setValue(replacementState);
  aborted = true;
  deferred.reject(new Error("late network exploded"));

  await pending;

  assert.deepEqual(stateStore.read(), replacementState);
  assert.equal(detachedDraftStore.read(), text);
  assert.equal(detachedStateStore.read().messages.length, 0);
  assert.match(detachedStateStore.read().error ?? "", /late network exploded/);
});

test("claude send uses returned outputText immediately when the file snapshot is still stale", async () => {
  const text = "直接用 CLI 返回结果";
  const draftStore = createStringStore("先发出去");
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    await new Promise<Response>(() => undefined);

  try {
    const result = await Promise.race([
      sendConversation({
        draft: draftStore.read(),
        onMessageSent: async () => {},
        onSendMessage: async () => ({
          sessionId: SESSION.id,
          turnId: "claude-turn-1",
          outputText: text,
        }),
        providerId: "claude",
        session: SESSION,
        streamAvailable: false,
        setDraft: draftStore.setValue,
        setState: stateStore.setValue,
        shouldAbort: () => false,
      }).then(() => "resolved"),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 80);
      }),
    ]);

    assert.equal(result, "resolved");
    assert.equal(draftStore.read(), "");
    assert.equal(stateStore.read().sendLifecycle?.phase, "completed");
    assert.deepEqual(
      stateStore.read().messages.map((message) => message.text),
      ["先发出去", text],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
