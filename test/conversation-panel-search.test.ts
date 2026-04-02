import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessage, ConversationSearchResult } from "../api/types";
import {
  ALL_SEARCH_RESULT_LIMIT,
  createConversationMessageIdSet,
  getWrappedSearchHitIndex,
  readSearchPageResultCountLabel,
  resolveSearchPageLimit,
  resolvePreferredSearchHitIndex,
} from "../web/conversation-panel-search";

function createSearchResult(messageIds: string[]): ConversationSearchResult {
  return {
    query: "task",
    mode: "compact",
    totalMessages: messageIds.length,
    totalHits: messageIds.length,
    hits: messageIds.map((messageId, index) => ({
      kind: "text",
      messageId,
      messageIndex: index,
      preview: `preview-${messageId}`,
      ranges: [{ start: 0, end: 4 }],
      role: "assistant",
      timestamp: `2026-04-02T00:00:0${index}.000Z`,
    })),
  };
}

test("getWrappedSearchHitIndex wraps in both directions", () => {
  assert.equal(getWrappedSearchHitIndex(-1, 3, 1), 0);
  assert.equal(getWrappedSearchHitIndex(-1, 3, -1), 2);
  assert.equal(getWrappedSearchHitIndex(2, 3, 1), 0);
  assert.equal(getWrappedSearchHitIndex(0, 3, -1), 2);
});

test("resolvePreferredSearchHitIndex keeps the previously active hit when it still exists", () => {
  const result = createSearchResult(["msg-1", "msg-2", "msg-3"]);

  assert.equal(
    resolvePreferredSearchHitIndex(result, result.hits[1] ?? null),
    1,
  );
  assert.equal(resolvePreferredSearchHitIndex(result, null), 0);
});

test("resolvePreferredSearchHitIndex falls back to the first hit when the old hit vanished", () => {
  const previous = createSearchResult(["msg-1", "msg-2"]);
  const next = createSearchResult(["msg-3", "msg-4"]);

  assert.equal(resolvePreferredSearchHitIndex(next, previous.hits[1] ?? null), 0);
});

test("createConversationMessageIdSet tracks the ids currently visible in the window", () => {
  const visibleMessages: ConversationMessage[] = [
    {
      id: "msg-10",
      kind: "text",
      role: "assistant",
      text: "任务已完成",
    },
    {
      id: "msg-11",
      kind: "text",
      role: "user",
      text: "继续查历史",
    },
  ];

  const ids = createConversationMessageIdSet(visibleMessages);

  assert.equal(ids.has("msg-10"), true);
  assert.equal(ids.has("msg-11"), true);
  assert.equal(ids.has("msg-12"), false);
});

test("resolveSearchPageLimit maps smaller fonts to larger result pages", () => {
  assert.equal(resolveSearchPageLimit(1), 20);
  assert.equal(resolveSearchPageLimit(4), 14);
  assert.equal(resolveSearchPageLimit(6), 10);
});

test("all-history search keeps the first 100 hits for arrow navigation labels", () => {
  assert.equal(ALL_SEARCH_RESULT_LIMIT, 100);
  assert.equal(
    readSearchPageResultCountLabel({
      activeHitIndex: -1,
      totalHits: 139,
      visibleHits: 100,
    }),
    "1/100",
  );
  assert.equal(
    readSearchPageResultCountLabel({
      activeHitIndex: 99,
      totalHits: 139,
      visibleHits: 100,
    }),
    "100/100",
  );
});
