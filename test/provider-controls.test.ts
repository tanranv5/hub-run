import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderModelOption } from "../api/types";
import {
  getEffortOptions,
  resolveSelectedEffort,
  resolveSelectedModelId,
  syncEffortSelection,
} from "../web/provider-controls";

const MODELS: ProviderModelOption[] = [
  {
    id: "gpt-5.4",
    displayName: "GPT-5.4",
    description: "",
    isDefault: true,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["none", "minimal", "low", "medium", "high", "xhigh"],
  },
  {
    id: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    description: "",
    isDefault: false,
    hidden: false,
    defaultReasoningEffort: null,
    supportedReasoningEfforts: [],
  },
];

test("getEffortOptions falls back to all model efforts when selected model has no explicit list", () => {
  assert.deepEqual(getEffortOptions(MODELS, "gpt-5.4-mini", null), [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
});

test("getEffortOptions prefers selected model effort list when it exists", () => {
  assert.deepEqual(getEffortOptions(MODELS, "gpt-5.4", null), [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
});

test("syncEffortSelection keeps the current effort when fallback options still include it", () => {
  assert.equal(syncEffortSelection(MODELS, "gpt-5.4-mini", "high"), "high");
});

test("getEffortOptions keeps the selected effort visible even if the model does not advertise it", () => {
  assert.deepEqual(getEffortOptions(MODELS, "gpt-5.4-mini", "xhigh"), [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
});

test("selected model prefers current session model before cached preference", () => {
  assert.equal(
    resolveSelectedModelId(MODELS, "gpt-5.4-mini", "gpt-5.4"),
    "gpt-5.4-mini",
  );
});

test("selected model falls back to cached preference before default model", () => {
  assert.equal(resolveSelectedModelId(MODELS, null, "gpt-5.4-mini"), "gpt-5.4-mini");
  assert.equal(resolveSelectedModelId(MODELS, null, "missing-model"), "gpt-5.4");
});

test("selected effort prefers current session effort before cached preference and default", () => {
  assert.equal(
    resolveSelectedEffort(MODELS, "gpt-5.4", "medium", "high"),
    "medium",
  );
  assert.equal(resolveSelectedEffort(MODELS, "gpt-5.4", null, "high"), "high");
  assert.equal(resolveSelectedEffort(MODELS, "gpt-5.4", null, null), "high");
});
