import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessage } from "../api/types";
import {
  appendOptimisticUserMessage,
  hasConversationChanged,
} from "../web/conversation-panel-state-helpers";

const BASE_MESSAGES: ConversationMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    kind: "text",
    text: "旧回复",
  },
];

test("appendOptimisticUserMessage appends a local user message immediately", () => {
  const nextMessages = appendOptimisticUserMessage(
    BASE_MESSAGES,
    "新问题",
    1000,
  );

  assert.equal(nextMessages.length, 2);
  assert.equal(nextMessages[1]?.id, "optimistic-user:1000");
  assert.equal(nextMessages[1]?.role, "user");
  assert.equal(nextMessages[1]?.text, "新问题");
});

test("hasConversationChanged returns false when server page is still stale", () => {
  assert.equal(hasConversationChanged(BASE_MESSAGES, BASE_MESSAGES), false);
});

test("hasConversationChanged returns true once server page includes new content", () => {
  const nextMessages: ConversationMessage[] = [
    ...BASE_MESSAGES,
    {
      id: "user-2",
      role: "user",
      kind: "text",
      text: "新问题",
    },
  ];

  assert.equal(hasConversationChanged(BASE_MESSAGES, nextMessages), true);
});
