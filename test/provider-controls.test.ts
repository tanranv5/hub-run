import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderModelOption } from "../api/types";
import {
  applyCreatedSessionProjectSelection,
  createLoadingProviderControls,
  getEffortOptions,
  INITIAL_PROVIDER_CONTROLS,
  resolveProviderControlsFromData,
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

test("provider switch clears stale controls before the new provider metadata loads", () => {
  const nextState = createLoadingProviderControls({
    ...INITIAL_PROVIDER_CONTROLS,
    models: [
      {
        id: "old-model",
        displayName: "Old Model",
        description: "stale",
        isDefault: true,
        hidden: false,
        defaultReasoningEffort: "high",
        supportedReasoningEfforts: ["medium", "high"],
      },
    ],
    projects: ["/tmp/old-project"],
    selectedProject: "/tmp/old-project",
    selectedModelId: "old-model",
    selectedEffort: "high",
    newSessionCwd: "/tmp/old-project",
    loading: false,
    creatingSession: true,
    error: "旧错误",
  });

  assert.deepEqual(nextState.models, []);
  assert.deepEqual(nextState.projects, []);
  assert.equal(nextState.selectedProject, null);
  assert.equal(nextState.selectedModelId, null);
  assert.equal(nextState.selectedEffort, null);
  assert.equal(nextState.newSessionCwd, "");
  assert.equal(nextState.loading, true);
  assert.equal(nextState.creatingSession, false);
  assert.equal(nextState.error, null);
});

test("provider init keeps the selected project path visible after refreshing the same provider", () => {
  const nextState = resolveProviderControlsFromData(
    ["/tmp/project-a", "/tmp/project-b"],
    MODELS,
    null,
    {
      newSessionCwd: "/tmp/project-b",
      selectedProject: "/tmp/project-b",
    },
  );

  assert.equal(nextState.selectedProject, "/tmp/project-b");
  assert.equal(nextState.newSessionCwd, "/tmp/project-b");
});

test("provider init preserves an active project filter even before the refreshed project list catches up", () => {
  const nextState = resolveProviderControlsFromData(
    ["/tmp/project-a"],
    MODELS,
    null,
    {
      newSessionCwd: "/tmp/new-project",
      selectedProject: "/tmp/new-project",
    },
  );

  assert.deepEqual(nextState.projects, ["/tmp/new-project", "/tmp/project-a"]);
  assert.equal(nextState.selectedProject, "/tmp/new-project");
  assert.equal(nextState.newSessionCwd, "/tmp/new-project");
});

test("created session selection promotes a newly created project into the active filter", () => {
  const nextState = applyCreatedSessionProjectSelection(
    {
      ...INITIAL_PROVIDER_CONTROLS,
      projects: ["/tmp/project-a"],
      newSessionCwd: "/tmp/missing-project",
      selectedProject: null,
    },
    "/tmp/missing-project",
  );

  assert.deepEqual(nextState.projects, ["/tmp/missing-project", "/tmp/project-a"]);
  assert.equal(nextState.selectedProject, "/tmp/missing-project");
  assert.equal(nextState.newSessionCwd, "/tmp/missing-project");
});
