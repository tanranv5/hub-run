import assert from "node:assert/strict";
import test from "node:test";
import { createConversationTimelineResetToken } from "../web/conversation-scroll-state";

test("conversation timeline reset token changes when the session changes", () => {
  assert.notEqual(
    createConversationTimelineResetToken("session-a", null),
    createConversationTimelineResetToken("session-b", null),
  );
});

test("conversation timeline reset token changes when the summary changes within one session", () => {
  assert.notEqual(
    createConversationTimelineResetToken("session-a", "summary-1"),
    createConversationTimelineResetToken("session-a", "summary-2"),
  );
});
