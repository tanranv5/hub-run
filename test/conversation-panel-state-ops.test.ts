import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, SetStateAction } from "react";
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
