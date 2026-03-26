import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, SetStateAction } from "react";
import type {
  PanelState,
} from "../web/conversation-panel-state-types";
import {
  INITIAL_PANEL_STATE,
} from "../web/conversation-panel-state-types";
import { respondToUserInputOption } from "../web/conversation-panel-codex-runtime";
import { interruptConversationTurn } from "../web/conversation-panel-interrupt";
import { createLiveRealtimeStreamStatus } from "../web/realtime-stream-status";
import { createSubmittedSendLifecycle } from "../web/conversation-send-state";
import type { ProviderUserInputRequest } from "../api/types";

const REQUEST: ProviderUserInputRequest = {
  requestId: "req-1",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-1",
  questions: [
    {
      id: "question-1",
      header: "确认",
      question: "继续吗？",
      isOther: false,
      isSecret: false,
      options: [{ label: "继续", description: "继续执行" }],
    },
  ],
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test("respondToUserInputOption ignores a late reload after the session changed", async () => {
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const submitDeferred = createDeferred<void>();
  const loadDeferred = createDeferred<PanelState>();
  let aborted = false;

  const pending = respondToUserInputOption({
    loadPage: async () => loadDeferred.promise,
    optionLabel: "继续",
    providerId: "codex",
    questionId: "question-1",
    request: REQUEST,
    sessionId: "thread-1",
    setState: stateStore.setValue,
    shouldAbort: () => aborted,
    submitResponse: async () => submitDeferred.promise,
  });

  await Promise.resolve();
  const replacementState: PanelState = {
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-replacement",
        role: "assistant",
        kind: "text",
        text: "这是新的会话面板",
      },
    ],
  };
  stateStore.setValue(replacementState);
  submitDeferred.resolve();
  await Promise.resolve();
  aborted = true;
  loadDeferred.resolve({
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-late",
        role: "assistant",
        kind: "text",
        text: "这是晚到的旧结果",
      },
    ],
  });

  await pending;

  assert.deepEqual(stateStore.read(), replacementState);
});

test("interruptConversationTurn ignores a late reload after the session changed", async () => {
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);
  const interruptDeferred = createDeferred<void>();
  const loadDeferred = createDeferred<PanelState>();
  let aborted = false;

  const pending = interruptConversationTurn({
    interruptSession: async () => interruptDeferred.promise,
    loadPage: async () => loadDeferred.promise,
    providerId: "codex",
    sessionId: "thread-1",
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
        text: "已经切到新的会话",
      },
    ],
  };
  stateStore.setValue(replacementState);
  interruptDeferred.resolve();
  await Promise.resolve();
  aborted = true;
  loadDeferred.resolve({
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-late",
        role: "assistant",
        kind: "text",
        text: "旧会话的中断回填",
      },
    ],
  });

  await pending;

  assert.deepEqual(stateStore.read(), replacementState);
});

test("interruptConversationTurn keeps interrupting while reload still reports generating", async () => {
  const stateStore = createPanelStateStore(INITIAL_PANEL_STATE);

  await interruptConversationTurn({
    interruptSession: async () => undefined,
    loadPage: async () => ({
      ...INITIAL_PANEL_STATE,
      threadState: {
        threadId: "thread-1",
        activeTurnId: "turn-1",
        isGenerating: true,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "inProgress",
      },
    }),
    providerId: "codex",
    sessionId: "thread-1",
    setState: stateStore.setValue,
  });

  assert.equal(stateStore.read().interrupting, true);
  assert.equal(stateStore.read().sendStatus, "正在中断当前回合...");
});

test("respondToUserInputOption preserves live stream state instead of resetting the panel", async (t) => {
  const originalNow = Date.now;
  Date.now = () => 456;
  t.after(() => {
    Date.now = originalNow;
  });

  const sendLifecycle = createSubmittedSendLifecycle("codex", "thread-1", 123);
  sendLifecycle.phase = "generating";
  const stateStore = createPanelStateStore({
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "msg-1",
        role: "user",
        kind: "text",
        text: "继续执行",
      },
    ],
    streamOffset: 18,
    streamStatus: createLiveRealtimeStreamStatus(123),
    sendLifecycle,
    sending: true,
    sendStatus: "正在提交用户输入...",
    threadState: {
      threadId: "thread-1",
      activeTurnId: "turn-1",
      isGenerating: true,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "inProgress",
    },
    pendingUserInputRequests: [REQUEST],
  });

  await respondToUserInputOption({
    loadPage: async () => ({
      ...INITIAL_PANEL_STATE,
      messages: [
        {
          id: "msg-2",
          role: "assistant",
          kind: "text",
          text: "继续执行中",
        },
      ],
      threadState: {
        threadId: "thread-1",
        activeTurnId: "turn-1",
        isGenerating: true,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "inProgress",
      },
      pendingUserInputRequests: [],
    }),
    optionLabel: "继续",
    providerId: "codex",
    questionId: "question-1",
    request: REQUEST,
    sessionId: "thread-1",
    setState: stateStore.setValue,
    submitResponse: async () => undefined,
  });

  const nextState = stateStore.read();
  assert.equal(nextState.streamOffset, 18);
  assert.equal(nextState.streamStatus.phase, "live");
  assert.equal(nextState.streamStatus.lastEventAt, 456);
  assert.equal(nextState.respondingRequestId, null);
  assert.equal(nextState.sendLifecycle, sendLifecycle);
  assert.equal(nextState.sendStatus, "Codex 已接受，正在生成...");
  assert.deepEqual(nextState.messages, [
    {
      id: "msg-2",
      role: "assistant",
      kind: "text",
      text: "继续执行中",
    },
  ]);
});
