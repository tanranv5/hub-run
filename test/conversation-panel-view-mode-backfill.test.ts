import assert from "node:assert/strict";
import test from "node:test";
import { resolveMessageViewModeBackfillAction } from "../web/components/conversation-panel";

test("message view mode backfill stays idle when no refill target is armed", () => {
  assert.equal(
    resolveMessageViewModeBackfillAction({
      hasOlderMessages: true,
      loading: false,
      loadingOlder: false,
      targetVisibleCount: null,
      visibleCount: 4,
    }),
    "idle",
  );
});

test("message view mode backfill clears once the new mode already has enough visible messages", () => {
  assert.equal(
    resolveMessageViewModeBackfillAction({
      hasOlderMessages: true,
      loading: false,
      loadingOlder: false,
      targetVisibleCount: 10,
      visibleCount: 10,
    }),
    "clear",
  );
});

test("message view mode backfill requests older data when the filtered result count drops below the previous visible count", () => {
  assert.equal(
    resolveMessageViewModeBackfillAction({
      hasOlderMessages: true,
      loading: false,
      loadingOlder: false,
      targetVisibleCount: 10,
      visibleCount: 6,
    }),
    "load",
  );
});

test("message view mode backfill waits for the active fetch to finish before retrying", () => {
  assert.equal(
    resolveMessageViewModeBackfillAction({
      hasOlderMessages: true,
      loading: false,
      loadingOlder: true,
      targetVisibleCount: 10,
      visibleCount: 6,
    }),
    "idle",
  );
});

test("message view mode backfill clears when there is no older data left to fetch", () => {
  assert.equal(
    resolveMessageViewModeBackfillAction({
      hasOlderMessages: false,
      loading: false,
      loadingOlder: false,
      targetVisibleCount: 10,
      visibleCount: 6,
    }),
    "clear",
  );
});
