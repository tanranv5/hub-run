import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, SetStateAction } from "react";
import { loadInitialPage } from "../web/conversation-panel-state-ops";
import { INITIAL_PANEL_STATE, type PanelState } from "../web/conversation-panel-state-types";
import { loadOlderMessagesUntilStart } from "../web/conversation-panel-state-ops";

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

test("loadOlderMessagesUntilStart keeps loading pages until nextBefore becomes null", async () => {
  const stateStore = createPanelStateStore({
    ...INITIAL_PANEL_STATE,
    messages: [
      {
        id: "latest-1",
        role: "assistant",
        kind: "text",
        text: "latest-1",
      },
    ],
    nextBefore: "cursor-2",
    olderLoadCount: 11,
  });
  const cursors: string[] = [];

  await loadOlderMessagesUntilStart({
    loadPage: async (_providerId, _sessionId, before) => {
      cursors.push(before);
      if (before === "cursor-2") {
        return {
          messages: [
            {
              id: "older-2",
              role: "user",
              kind: "text",
              text: "older-2",
            },
          ],
          nextBefore: "cursor-1",
          summary: null,
        };
      }
      return {
        messages: [
          {
            id: "older-1",
            role: "user",
            kind: "text",
            text: "older-1",
          },
        ],
        nextBefore: null,
        summary: null,
      };
    },
    nextBefore: "cursor-2",
    providerId: "codex",
    sessionId: "thread-1",
    setState: stateStore.setValue,
  });

  assert.deepEqual(cursors, ["cursor-2", "cursor-1"]);
  assert.equal(stateStore.read().nextBefore, null);
  assert.equal(stateStore.read().loadingOlder, false);
  assert.deepEqual(
    stateStore.read().messages.map((message) => message.id),
    ["older-1", "older-2", "latest-1"],
  );
});

test("loadInitialPage keeps a runtime completed status message visible before task_complete is persisted", async () => {
  const state = await loadInitialPage("codex", "thread-1", {
    getPage: async () => ({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          kind: "text",
          text: "最终输出",
          timestamp: "2026-03-20T12:00:00.000Z",
        },
        {
          id: "status-start-1",
          role: "system",
          kind: "text",
          title: "status",
          text: "任务已开始（turn=turn-1）。",
          timestamp: "2026-03-20T12:00:01.000Z",
        },
      ],
      nextBefore: null,
      summary: null,
    }),
    loadRuntime: async () => ({
      pendingUserInputRequests: [],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "completed",
      },
    }),
    now: () => 1_710_000_000_000,
  });

  assert.deepEqual(
    state.messages.map((message) => message.text),
    ["最终输出", "任务已开始（turn=turn-1）。", "任务已完成（turn=turn-1）"],
  );
});

test("loadInitialPage does not duplicate runtime completed status when task_complete is already persisted", async () => {
  const state = await loadInitialPage("codex", "thread-1", {
    getPage: async () => ({
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          kind: "text",
          text: "最终输出",
          timestamp: "2026-03-20T12:00:00.000Z",
        },
        {
          id: "status-complete-1",
          role: "system",
          kind: "text",
          title: "status",
          text: "任务已完成（turn=turn-1）",
          timestamp: "2026-03-20T12:00:02.000Z",
        },
      ],
      nextBefore: null,
      summary: null,
    }),
    loadRuntime: async () => ({
      pendingUserInputRequests: [],
      threadState: {
        threadId: "thread-1",
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-1",
        requestedTurnStatus: "completed",
      },
    }),
    now: () => 1_710_000_000_000,
  });

  assert.deepEqual(
    state.messages.map((message) => message.id),
    ["msg-1", "status-complete-1"],
  );
});

test("loadInitialPage forwards mode to the page loader", async () => {
  let capturedMode: string | undefined;

  await loadInitialPage("codex", "thread-1", {
    getPage: async (_providerId, _sessionId, _before, _limit, mode) => {
      capturedMode = mode;
      return {
        messages: [],
        nextBefore: null,
        summary: null,
      };
    },
    loadRuntime: async () => ({
      pendingUserInputRequests: [],
      threadState: null,
    }),
    mode: "text",
  });

  assert.equal(capturedMode, "text");
});

test("loadOlderMessagesUntilStart forwards mode to each page load", async () => {
  const stateStore = createPanelStateStore({
    ...INITIAL_PANEL_STATE,
    messages: [],
    nextBefore: "cursor-2",
  });
  const capturedModes: string[] = [];

  await loadOlderMessagesUntilStart({
    loadPage: async (_providerId, _sessionId, before, _limit, mode) => {
      capturedModes.push(`${before}:${mode ?? "missing"}`);
      return {
        messages: [],
        nextBefore: before === "cursor-2" ? "cursor-1" : null,
        summary: null,
      };
    },
    mode: "compact",
    nextBefore: "cursor-2",
    providerId: "codex",
    sessionId: "thread-1",
    setState: stateStore.setValue,
  });

  assert.deepEqual(capturedModes, ["cursor-2:compact", "cursor-1:compact"]);
});
