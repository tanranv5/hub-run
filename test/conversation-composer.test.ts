import assert from "node:assert/strict";
import test from "node:test";
import { shouldSubmitOnEnter } from "../web/conversation-composer-helpers";

test("shouldSubmitOnEnter returns true for plain Enter", () => {
  assert.equal(
    shouldSubmitOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: false,
    }),
    true,
  );
});

test("shouldSubmitOnEnter ignores Shift+Enter for newline", () => {
  assert.equal(
    shouldSubmitOnEnter({
      key: "Enter",
      shiftKey: true,
      isComposing: false,
    }),
    false,
  );
});

test("shouldSubmitOnEnter ignores composing Enter", () => {
  assert.equal(
    shouldSubmitOnEnter({
      key: "Enter",
      shiftKey: false,
      isComposing: true,
    }),
    false,
  );
});

test("shouldSubmitOnEnter ignores non-Enter keys", () => {
  assert.equal(
    shouldSubmitOnEnter({
      key: "a",
      shiftKey: false,
      isComposing: false,
    }),
    false,
  );
});
