import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessage } from "../api/types";
import { INITIAL_PANEL_STATE } from "../web/conversation-panel-state-types";
import * as conversationStreamState from "../web/conversation-stream-state";
const {
  applyConversationSnapshot,
  applyConversationDelta,
  buildConversationStreamUrl,
} = conversationStreamState;

const USER_MESSAGE: ConversationMessage = {
  id: "user-1",
  role: "user",
  kind: "text",
  text: "旧问题",
};

const TOOL_MESSAGE: ConversationMessage = {
  id: "tool-1",
  role: "assistant",
  kind: "tool_use",
  text: "读取文件",
};

const RESULT_MESSAGE: ConversationMessage = {
  id: "tool-2",
  role: "assistant",
  kind: "tool_result",
  text: "读取完成",
};

const OPTIMISTIC_USER_MESSAGE: ConversationMessage = {
  id: "optimistic-user:2000",
  role: "user",
  kind: "text",
  text: "刚发出去的新问题",
  timestamp: "2026-03-22T00:00:02.000Z",
};

const SERVER_USER_MESSAGE: ConversationMessage = {
  id: "user-2",
  role: "user",
  kind: "text",
  text: "刚发出去的新问题",
  timestamp: "2026-03-22T00:00:03.000Z",
};

const TASK_STARTED_MESSAGE: ConversationMessage = {
  id: "status-1",
  role: "system",
  kind: "text",
  title: "status",
  text: "任务已开始（turn=turn-1）。",
  timestamp: "2026-03-22T00:00:02.500Z",
};

test("conversation snapshot replaces latest window and clears loading state", () => {
  const nextState = applyConversationSnapshot(
    {
      ...INITIAL_PANEL_STATE,
      messages: [USER_MESSAGE],
      nextBefore: "1",
      loading: true,
      error: "old error",
    },
    {
      messages: [TOOL_MESSAGE, RESULT_MESSAGE],
      nextBefore: "3",
      nextOffset: 512,
      summary: null,
    },
  );

  assert.deepEqual(
    nextState.messages.map((message) => message.id),
    ["tool-1", "tool-2"],
  );
  assert.equal(nextState.nextBefore, "3");
  assert.equal(nextState.streamOffset, 512);
  assert.equal(nextState.loading, false);
  assert.equal(nextState.error, null);
});

test("conversation snapshot preserves already loaded older messages ahead of the latest window", () => {
  const olderMessage: ConversationMessage = {
    id: "older-1",
    role: "user",
    kind: "text",
    text: "更早之前的消息",
  };
  const overlappingLatest: ConversationMessage = {
    id: "latest-1",
    role: "assistant",
    kind: "text",
    text: "最近窗口里的旧消息",
  };
  const newerLatest: ConversationMessage = {
    id: "latest-2",
    role: "assistant",
    kind: "text",
    text: "最近窗口里的新消息",
  };

  const nextState = applyConversationSnapshot(
    {
      ...INITIAL_PANEL_STATE,
      messages: [olderMessage, overlappingLatest],
      nextBefore: "9",
    },
    {
      messages: [overlappingLatest, newerLatest],
      nextBefore: "8",
      nextOffset: 1024,
      summary: null,
    },
  );

  assert.deepEqual(
    nextState.messages.map((message) => message.id),
    ["older-1", "latest-1", "latest-2"],
  );
});

test("conversation snapshot keeps an optimistic user message visible until the server confirms it", () => {
  const nextState = applyConversationSnapshot(
    {
      ...INITIAL_PANEL_STATE,
      messages: [USER_MESSAGE, OPTIMISTIC_USER_MESSAGE],
      nextBefore: "9",
    },
    {
      messages: [USER_MESSAGE, TASK_STARTED_MESSAGE],
      nextBefore: "8",
      nextOffset: 1024,
      summary: null,
    },
  );

  assert.deepEqual(
    nextState.messages.map((message) => message.id),
    ["user-1", "optimistic-user:2000", "status-1"],
  );
});

test("conversation snapshot marks realtime stream as live", () => {
  const nextState = applyConversationSnapshot(
    {
      ...INITIAL_PANEL_STATE,
      streamStatus: {
        phase: "connecting",
        lastEventAt: null,
        retryCount: 0,
      },
    } as typeof INITIAL_PANEL_STATE,
    {
      messages: [TOOL_MESSAGE, RESULT_MESSAGE],
      nextBefore: "3",
      nextOffset: 512,
      summary: null,
    },
  ) as typeof INITIAL_PANEL_STATE & {
    streamStatus?: { phase?: string; lastEventAt?: number | null };
  };

  assert.equal(nextState.streamStatus?.phase, "live");
  assert.equal(typeof nextState.streamStatus?.lastEventAt, "number");
});

test("conversation delta appends only unseen messages and advances stream offset", () => {
  const nextState = applyConversationDelta(
    {
      ...INITIAL_PANEL_STATE,
      messages: [USER_MESSAGE, TOOL_MESSAGE],
      streamOffset: 512,
    },
    {
      messages: [TOOL_MESSAGE, RESULT_MESSAGE],
      nextOffset: 768,
    },
  );

  assert.deepEqual(
    nextState.messages.map((message) => message.id),
    ["user-1", "tool-1", "tool-2"],
  );
  assert.equal(nextState.streamOffset, 768);
});

test("conversation delta clears reconnecting state after new messages arrive", () => {
  const nextState = applyConversationDelta(
    {
      ...INITIAL_PANEL_STATE,
      messages: [USER_MESSAGE, TOOL_MESSAGE],
      streamOffset: 512,
      streamStatus: {
        phase: "reconnecting",
        lastEventAt: 128,
        retryCount: 3,
      },
    } as typeof INITIAL_PANEL_STATE,
    {
      messages: [RESULT_MESSAGE],
      nextOffset: 768,
    },
  ) as typeof INITIAL_PANEL_STATE & {
    streamStatus?: { phase?: string; retryCount?: number };
  };

  assert.equal(nextState.streamStatus?.phase, "live");
  assert.equal(nextState.streamStatus?.retryCount, 0);
});

test("conversation delta keeps the confirmed user message ahead of task_started and removes the optimistic duplicate", () => {
  const nextState = applyConversationDelta(
    {
      ...INITIAL_PANEL_STATE,
      messages: [USER_MESSAGE, OPTIMISTIC_USER_MESSAGE],
      streamOffset: 512,
    },
    {
      messages: [TASK_STARTED_MESSAGE, SERVER_USER_MESSAGE],
      nextOffset: 768,
    },
  );

  assert.deepEqual(
    nextState.messages.map((message) => message.id),
    ["user-1", "user-2", "status-1"],
  );
});

test("conversation snapshot buffers latest window while history view is frozen, and applies it only when requested", () => {
  const applyBufferedConversationWindow = (
    conversationStreamState as Record<string, unknown>
  ).applyBufferedConversationWindow;
  assert.equal(typeof applyBufferedConversationWindow, "function");

  const frozenState = applyConversationSnapshot(
    {
      ...INITIAL_PANEL_STATE,
      messages: [USER_MESSAGE],
      nextBefore: "9",
      messageWindowFrozen: true,
      bufferedConversationWindow: null,
    } as typeof INITIAL_PANEL_STATE & {
      messageWindowFrozen: boolean;
      bufferedConversationWindow: {
        messages: ConversationMessage[];
        nextBefore: string | null;
        summary: ConversationMessage | null;
        streamOffset: number | null;
      } | null;
    },
    {
      messages: [TOOL_MESSAGE, RESULT_MESSAGE],
      nextBefore: "8",
      nextOffset: 1024,
      summary: null,
    },
  ) as typeof INITIAL_PANEL_STATE & {
    messageWindowFrozen: boolean;
    bufferedConversationWindow: {
      messages: ConversationMessage[];
      nextBefore: string | null;
      summary: ConversationMessage | null;
      streamOffset: number | null;
    } | null;
  };

  assert.deepEqual(
    frozenState.messages.map((message) => message.id),
    ["user-1"],
  );
  assert.deepEqual(
    frozenState.bufferedConversationWindow?.messages.map((message) => message.id),
    ["tool-1", "tool-2"],
  );
  assert.equal(frozenState.streamOffset, 1024);

  const resumedState = (
    applyBufferedConversationWindow as (state: typeof frozenState) => typeof frozenState
  )(frozenState);
  assert.equal(resumedState.messageWindowFrozen, false);
  assert.equal(resumedState.bufferedConversationWindow, null);
  assert.deepEqual(
    resumedState.messages.map((message) => message.id),
    ["tool-1", "tool-2"],
  );
});

test("conversation stream url includes limit and offset when provided", () => {
  assert.equal(
    buildConversationStreamUrl("codex", "thread-1", 10, 768),
    "/api/providers/codex/sessions/thread-1/messages/stream?limit=10&offset=768",
  );
});
