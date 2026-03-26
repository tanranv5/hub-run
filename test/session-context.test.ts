import assert from "node:assert/strict";
import test from "node:test";
import { formatContextDetails, formatContextLabel } from "../web/session-context";

test("formatContextLabel shows used percent instead of context left percent", () => {
  assert.equal(
    formatContextLabel({
      sessionId: "s-1",
      modelId: "gpt-5",
      reasoningEffort: "high",
      usedTokens: 211213,
      modelContextWindow: 258400,
      contextLeftPercent: 18,
    }),
    "81%",
  );
});

test("formatContextDetails shows raw used/window tokens for tooltip", () => {
  assert.equal(
    formatContextDetails({
      sessionId: "s-1",
      modelId: "gpt-5",
      reasoningEffort: "high",
      usedTokens: 211213,
      modelContextWindow: 258400,
      contextLeftPercent: 18,
    }),
    "211213/258400",
  );
});

test("formatContextLabel can derive used percent when only left percent and window exist", () => {
  assert.equal(
    formatContextLabel({
      sessionId: "s-1",
      modelId: "gpt-5",
      reasoningEffort: "high",
      usedTokens: null,
      modelContextWindow: 258400,
      contextLeftPercent: 18,
    }),
    "82%",
  );
});

test("formatContextLabel stays empty when used tokens and left percent are both unknown", () => {
  assert.equal(
    formatContextLabel({
      sessionId: "s-1",
      modelId: "gpt-5",
      reasoningEffort: "high",
      usedTokens: null,
      modelContextWindow: 258400,
      contextLeftPercent: null,
    }),
    null,
  );
});
