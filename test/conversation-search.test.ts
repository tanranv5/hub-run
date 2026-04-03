import assert from "node:assert/strict";
import test from "node:test";
import {
  searchConversationMessagePage,
  searchConversationMessages,
} from "../api/conversation-search";
import type { ConversationMessage } from "../api/types";

function createMessage(props: {
  id: string;
  kind?: ConversationMessage["kind"];
  role?: ConversationMessage["role"];
  text: string;
  title?: string;
}) {
  const {
    id,
    kind = "text",
    role = "assistant",
    text,
    title,
  } = props;
  return {
    id,
    anchor: { offset: Number.parseInt(id.replace("msg-", ""), 10) * 10, blockIndex: 0 },
    kind,
    role,
    text,
    title,
  } satisfies ConversationMessage;
}

test("searchConversationMessages keeps only the recent 10 visible messages for compact mode", () => {
  const messages: ConversationMessage[] = [
    createMessage({ id: "msg-1", text: "历史工具结果", kind: "tool_result" }),
    ...Array.from({ length: 12 }, (_, index) =>
      createMessage({
        id: `msg-${index + 2}`,
        role: index % 2 === 0 ? "assistant" : "user",
        text: index >= 2 ? `alpha recent-${index}` : `history-${index}`,
      }),
    ),
  ];

  const result = searchConversationMessages({
    messages,
    mode: "compact",
    query: "alpha",
    recentLimit: 10,
  });

  assert.equal(result.totalMessages, 10);
  assert.equal(result.totalHits, 10);
  assert.deepEqual(
    result.hits.map((hit) => hit.messageId),
    ["msg-4", "msg-5", "msg-6", "msg-7", "msg-8", "msg-9", "msg-10", "msg-11", "msg-12", "msg-13"],
  );
});

test("searchConversationMessages backfills text mode until it finds 10 visible text messages", () => {
  const messages: ConversationMessage[] = [
    ...Array.from({ length: 6 }, (_, index) =>
      createMessage({
        id: `msg-${index + 1}`,
        kind: "tool_result",
        text: `tool-${index}`,
      }),
    ),
    ...Array.from({ length: 11 }, (_, index) =>
      createMessage({
        id: `msg-${index + 7}`,
        role: index % 2 === 0 ? "assistant" : "user",
        text: `alpha text-${index}`,
      }),
    ),
  ];

  const result = searchConversationMessages({
    messages,
    mode: "text",
    query: "alpha",
    recentLimit: 10,
  });

  assert.equal(result.totalMessages, 10);
  assert.equal(result.totalHits, 10);
  assert.deepEqual(
    result.hits.map((hit) => hit.messageId),
    ["msg-8", "msg-9", "msg-10", "msg-11", "msg-12", "msg-13", "msg-14", "msg-15", "msg-16", "msg-17"],
  );
});

test("searchConversationMessagePage paginates within the recent limited message window", () => {
  const messages: ConversationMessage[] = Array.from({ length: 12 }, (_, index) =>
    createMessage({
      id: `msg-${index + 1}`,
      role: index % 2 === 0 ? "assistant" : "user",
      text: `alpha page-${index}`,
    }),
  );

  const page = searchConversationMessagePage({
    anchor: null,
    limit: 3,
    messages,
    mode: "text",
    query: "alpha",
    recentLimit: 10,
  });

  assert.equal(page.totalHits, 10);
  assert.deepEqual(
    page.hits.map((hit) => hit.messageId),
    ["msg-3", "msg-4", "msg-5"],
  );
});
