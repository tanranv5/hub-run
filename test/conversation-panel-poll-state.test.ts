import assert from "node:assert/strict";
import test from "node:test";
import type { PanelState } from "../web/conversation-panel-state-types";
import { INITIAL_PANEL_STATE } from "../web/conversation-panel-state-types";
import {
  acceptPanelSendLifecycle,
  beginPanelSendLifecycle,
} from "../web/conversation-panel-send";
import {
  mergePolledPanelState,
  shouldRefreshConversationDuringRuntime,
} from "../web/conversation-panel-poll-state";

const BASE_MESSAGE = {
  id: "msg-1",
  role: "user" as const,
  kind: "message" as const,
  text: "hello",
  createdAt: "2026-03-20T12:00:00.000Z",
};

function createAcceptedPanelState(): PanelState {
  const submitted = beginPanelSendLifecycle(
    {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
    },
    "codex",
    "thread-1",
    1_000,
  );
  return acceptPanelSendLifecycle(submitted, "codex", "thread-1", "turn-1", 1_200);
}

test("poll merge preserves accepted send lifecycle before runtime progress arrives", () => {
  const current = createAcceptedPanelState();
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
    },
    providerId: "codex",
    now: 1_300,
  });

  assert.equal(merged.sendLifecycle?.phase, "accepted");
  assert.equal(merged.sendStatus, "消息已被接受，等待 Codex 开始处理...");
  assert.equal(merged.sending, true);
});

test("poll merge advances send lifecycle when runtime state starts generating", () => {
  const current = createAcceptedPanelState();
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
      threadState: {
        threadId: "thread-1",
        activeTurnId: "turn-1",
        isGenerating: true,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "inProgress",
      },
    },
    providerId: "codex",
    now: 1_400,
  });

  assert.equal(merged.sendLifecycle?.phase, "generating");
  assert.equal(merged.sendStatus, "Codex 已接受，正在生成...");
  assert.equal(merged.sending, true);
});

test("poll merge clears interrupting once runtime leaves generating and exposes interrupted status", () => {
  const current = {
    ...createAcceptedPanelState(),
    interrupting: true,
  };
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "interrupted",
      },
    },
    providerId: "codex",
    now: 1_500,
  });

  assert.equal(merged.interrupting, false);
  assert.equal(merged.sendLifecycle?.phase, "interrupted");
  assert.equal(merged.sendStatus, "当前回合已中断");
  assert.equal(merged.sending, false);
});

test("poll merge appends terminal status message when the requested turn finishes", () => {
  const current = createAcceptedPanelState();
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "completed",
      },
    },
    providerId: "codex",
    now: 1_600,
  });

  assert.equal(merged.messages.length, 2);
  assert.equal(merged.messages[0]?.id, BASE_MESSAGE.id);
  assert.equal(merged.messages[1]?.text, "任务已完成（turn=turn-1）");
  assert.equal(merged.sendLifecycle?.phase, "completed");
  assert.equal(merged.sending, false);
  assert.equal(merged.pendingTerminalSyncTurnId, null);
});

test("poll merge preserves local terminal status after the final sync", () => {
  const completedState = mergePolledPanelState({
    current: createAcceptedPanelState(),
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "completed",
      },
    },
    providerId: "codex",
    now: 1_600,
  });

  const merged = mergePolledPanelState({
    current: {
      ...completedState,
      pendingTerminalSyncTurnId: "turn-1",
      streamStatus: {
        phase: "live",
        lastEventAt: 1_650,
        retryCount: 0,
      },
    },
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "completed",
      },
      streamOffset: 128,
    },
    providerId: "codex",
    now: 1_700,
  });

  assert.deepEqual(
    merged.messages.map((message) => message.text),
    [BASE_MESSAGE.text, "任务已完成（turn=turn-1）"],
  );
  assert.equal(merged.pendingTerminalSyncTurnId, null);
  assert.equal(merged.streamOffset, 128);
});

test("poll merge does not keep the local terminal status when the persisted task_complete message is already present", () => {
  const completedState = mergePolledPanelState({
    current: createAcceptedPanelState(),
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [BASE_MESSAGE],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "completed",
      },
    },
    providerId: "codex",
    now: 1_600,
  });

  const merged = mergePolledPanelState({
    current: {
      ...completedState,
      pendingTerminalSyncTurnId: "turn-1",
    },
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [
        BASE_MESSAGE,
        {
          id: "status-complete-1",
          role: "system" as const,
          kind: "text" as const,
          title: "status",
          text: "任务已完成（turn=turn-1）",
          timestamp: "2026-03-20T12:00:05.000Z",
        },
      ],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "completed",
      },
    },
    providerId: "codex",
    now: 1_700,
  });

  assert.deepEqual(
    merged.messages.map((message) => message.id),
    [BASE_MESSAGE.id, "status-complete-1"],
  );
  assert.equal(merged.pendingTerminalSyncTurnId, null);
});

test("poll merge keeps optimistic user message ahead of trailing task started status", () => {
  const current = {
    ...createAcceptedPanelState(),
    messages: [
      BASE_MESSAGE,
      {
        id: "optimistic-user:2000",
        role: "user" as const,
        kind: "text" as const,
        text: "继续执行",
        timestamp: "2026-03-20T12:00:02.000Z",
      },
    ],
  };
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [
        BASE_MESSAGE,
        {
          id: "status-1",
          role: "system" as const,
          kind: "text" as const,
          title: "status",
          text: "任务已开始（turn=turn-1）。",
          timestamp: "2026-03-20T12:00:03.000Z",
        },
      ],
    },
    providerId: "codex",
    now: 1_700,
  });

  assert.deepEqual(
    merged.messages.map((message) => message.id),
    [BASE_MESSAGE.id, "optimistic-user:2000", "status-1"],
  );
});

test("poll merge drops optimistic user message once the server confirms it even with codex noise blocks", () => {
  const current = {
    ...createAcceptedPanelState(),
    messages: [
      BASE_MESSAGE,
      {
        id: "optimistic-user:2000",
        role: "user" as const,
        kind: "text" as const,
        text: "继续执行",
        timestamp: "2026-03-20T12:00:02.000Z",
      },
    ],
  };
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [
        BASE_MESSAGE,
        {
          id: "user-2",
          role: "user" as const,
          kind: "text" as const,
          text:
            "<user_instructions>\nAGENTS.md - test\n</user_instructions>\n" +
            "继续执行",
          timestamp: "2026-03-20T12:00:03.000Z",
        },
        {
          id: "assistant-2",
          role: "assistant" as const,
          kind: "text" as const,
          text: "继续执行中",
          timestamp: "2026-03-20T12:00:04.000Z",
        },
      ],
    } as PanelState,
    providerId: "codex",
    now: 1_750,
  });

  assert.deepEqual(
    merged.messages.map((message) => message.id),
    [BASE_MESSAGE.id, "user-2", "assistant-2"],
  );
});

test("poll merge drops optimistic image once the server confirms the same image block", () => {
  const current = {
    ...createAcceptedPanelState(),
    messages: [
      BASE_MESSAGE,
      {
        id: "optimistic-user:2000:image:0",
        role: "user" as const,
        kind: "image" as const,
        text: "shot.png",
        timestamp: "2026-03-20T12:00:02.000Z",
        block: {
          type: "image" as const,
          imageUrl: "data:image/png;base64,AAAA",
        },
      },
    ],
  };
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [
        BASE_MESSAGE,
        {
          id: "user-image-2",
          role: "user" as const,
          kind: "image" as const,
          text: "",
          timestamp: "2026-03-20T12:00:03.000Z",
          block: {
            type: "image" as const,
            imageUrl: "data:image/png;base64,AAAA",
          },
        },
        {
          id: "status-1",
          role: "system" as const,
          kind: "text" as const,
          title: "status",
          text: "任务已开始（turn=turn-1）。",
          timestamp: "2026-03-20T12:00:04.000Z",
        },
      ],
    } as PanelState,
    providerId: "codex",
    now: 1_760,
  });

  assert.deepEqual(
    merged.messages.map((message) => message.id),
    [BASE_MESSAGE.id, "user-image-2", "status-1"],
  );
});

test("poll merge buffers the latest window while history browsing is frozen", () => {
  const current = {
    ...createAcceptedPanelState(),
    messageWindowFrozen: true,
    bufferedConversationWindow: null,
  } as PanelState & {
    messageWindowFrozen: boolean;
    bufferedConversationWindow: {
      messages: PanelState["messages"];
      nextBefore: string | null;
      summary: PanelState["summary"];
      streamOffset: number | null;
    } | null;
  };
  const merged = mergePolledPanelState({
    current,
    nextState: {
      ...INITIAL_PANEL_STATE,
      messages: [
        BASE_MESSAGE,
        {
          id: "assistant-1",
          role: "assistant" as const,
          kind: "text" as const,
          text: "这是新的最新消息",
          timestamp: "2026-03-20T12:00:04.000Z",
        },
      ],
      nextBefore: "7",
      streamOffset: 2_048,
    } as PanelState,
    providerId: "codex",
    now: 1_800,
  }) as PanelState & {
    messageWindowFrozen: boolean;
    bufferedConversationWindow: {
      messages: PanelState["messages"];
      nextBefore: string | null;
      summary: PanelState["summary"];
      streamOffset: number | null;
    } | null;
  };

  assert.deepEqual(
    merged.messages.map((message) => message.id),
    [BASE_MESSAGE.id],
  );
  assert.equal(merged.messageWindowFrozen, true);
  assert.deepEqual(
    merged.bufferedConversationWindow?.messages.map((message) => message.id),
    [BASE_MESSAGE.id, "assistant-1"],
  );
  assert.equal(merged.bufferedConversationWindow?.nextBefore, "7");
  assert.equal(merged.streamOffset, 2_048);
});

test("runtime refresh requests latest messages when generating stream is stale", () => {
  const current = {
    ...createAcceptedPanelState(),
    threadState: {
      threadId: "thread-1",
      activeTurnId: "turn-1",
      isGenerating: true,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "inProgress" as const,
    },
    streamStatus: {
      phase: "live" as const,
      lastEventAt: 1_000,
      retryCount: 0,
    },
  };

  assert.equal(
    shouldRefreshConversationDuringRuntime({
      current,
      now: 3_500,
      streamAvailable: true,
    }),
    true,
  );
});

test("runtime refresh skips message poll while live stream is still fresh", () => {
  const current = {
    ...createAcceptedPanelState(),
    threadState: {
      threadId: "thread-1",
      activeTurnId: "turn-1",
      isGenerating: true,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "inProgress" as const,
    },
    streamStatus: {
      phase: "live" as const,
      lastEventAt: 3_000,
      retryCount: 0,
    },
  };

  assert.equal(
    shouldRefreshConversationDuringRuntime({
      current,
      now: 3_500,
      streamAvailable: true,
    }),
    false,
  );
});

test("runtime refresh still requests a final sync after runtime reaches terminal state", () => {
  const current = {
    ...createAcceptedPanelState(),
    pendingTerminalSyncTurnId: "turn-1",
    threadState: {
      threadId: "thread-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "completed" as const,
    },
    streamStatus: {
      phase: "live" as const,
      lastEventAt: 3_400,
      retryCount: 0,
    },
  };

  assert.equal(
    shouldRefreshConversationDuringRuntime({
      current,
      now: 3_500,
      streamAvailable: true,
    }),
    true,
  );
});

test("runtime refresh does not wait two full intervals before polling stale live stream", () => {
  const current = {
    ...createAcceptedPanelState(),
    threadState: {
      threadId: "thread-1",
      activeTurnId: "turn-1",
      isGenerating: true,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "inProgress" as const,
    },
    streamStatus: {
      phase: "live" as const,
      lastEventAt: 2_200,
      retryCount: 0,
    },
  };

  assert.equal(
    shouldRefreshConversationDuringRuntime({
      current,
      now: 3_500,
      streamAvailable: true,
    }),
    true,
  );
});
