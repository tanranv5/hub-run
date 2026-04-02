import assert from "node:assert/strict";
import test from "node:test";
import {
  clampComposerStoredHeight,
  COMPOSER_COLLAPSED_HEIGHT_PX,
  COMPOSER_DEFAULT_HEIGHT_PX,
  COMPOSER_MAX_HEIGHT_PX,
  COMPOSER_MIN_HEIGHT_PX,
  resolveComposerStoredHeightFromTopDrag,
  resolveComposerTextareaHeight,
} from "../web/components/conversation-composer";

test("clampComposerStoredHeight keeps manual resize within supported bounds", () => {
  assert.equal(
    clampComposerStoredHeight(COMPOSER_MIN_HEIGHT_PX - 20),
    COMPOSER_MIN_HEIGHT_PX,
  );
  assert.equal(
    clampComposerStoredHeight(COMPOSER_MAX_HEIGHT_PX + 40),
    COMPOSER_MAX_HEIGHT_PX,
  );
  assert.equal(clampComposerStoredHeight(188.4), 188);
});

test("resolveComposerTextareaHeight prefers collapsed browsing mode over stored height", () => {
  assert.equal(
    resolveComposerTextareaHeight({
      browseCollapsed: true,
      contentHeight: 180,
      storedHeight: 240,
    }),
    COMPOSER_COLLAPSED_HEIGHT_PX,
  );
});

test("resolveComposerTextareaHeight restores stored height after leaving browse mode", () => {
  assert.equal(
    resolveComposerTextareaHeight({
      browseCollapsed: false,
      contentHeight: COMPOSER_DEFAULT_HEIGHT_PX,
      storedHeight: 206,
    }),
    206,
  );
});

test("resolveComposerTextareaHeight falls back to measured content height when no manual preference exists", () => {
  assert.equal(
    resolveComposerTextareaHeight({
      browseCollapsed: false,
      contentHeight: 0,
      storedHeight: null,
    }),
    COMPOSER_DEFAULT_HEIGHT_PX,
  );
  assert.equal(
    resolveComposerTextareaHeight({
      browseCollapsed: false,
      contentHeight: 156,
      storedHeight: null,
    }),
    156,
  );
});

test("resolveComposerStoredHeightFromTopDrag matches top-border resize semantics", () => {
  assert.equal(
    resolveComposerStoredHeightFromTopDrag({
      initialHeight: 180,
      originClientY: 400,
      nextClientY: 360,
    }),
    220,
  );
  assert.equal(
    resolveComposerStoredHeightFromTopDrag({
      initialHeight: 180,
      originClientY: 400,
      nextClientY: 430,
    }),
    150,
  );
});
