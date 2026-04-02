import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexCliArgs,
  parseCodexCliJsonLines,
} from "../api/providers/transports/codex-cli-shared";
import { listStaticCodexModels } from "../api/providers/transports/codex-models";

test("codex cli create args include model and reasoning effort overrides", () => {
  const args = buildCodexCliArgs({
    cwd: "/workspace/demo",
    mode: "create",
    text: "创建会话并发送首条消息",
    model: "gpt-5.3-codex",
    effort: "high",
  });

  assert.deepEqual(args, [
    "exec",
    "-C",
    "/workspace/demo",
    "-m",
    "gpt-5.3-codex",
    "-c",
    'model_reasoning_effort="high"',
    "创建会话并发送首条消息",
    "--json",
    "--skip-git-repo-check",
  ]);
});

test("codex cli resume args include model and reasoning effort overrides", () => {
  const args = buildCodexCliArgs({
    mode: "resume",
    sessionId: "session-123",
    cwd: "/workspace/demo",
    text: "继续",
    model: "gpt-5.3-codex",
    effort: "high",
  });

  assert.deepEqual(args, [
    "exec",
    "-C",
    "/workspace/demo",
    "-m",
    "gpt-5.3-codex",
    "-c",
    'model_reasoning_effort="high"',
    "resume",
    "session-123",
    "继续",
    "--json",
    "--skip-git-repo-check",
  ]);
});

test("codex cli json parser extracts thread id and last assistant text", () => {
  const parsed = parseCodexCliJsonLines([
    '{"type":"thread.started","thread_id":"thread-123"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"解析完成"}}',
  ].join("\n"));

  assert.deepEqual(parsed, {
    sessionId: "thread-123",
    outputText: "解析完成",
  });
});

test("static codex models expose a default cli-safe option", () => {
  const models = listStaticCodexModels();

  assert.equal(models.length, 6);
  assert.deepEqual(models[0], {
    id: "gpt-5.4",
    displayName: "gpt-5.4",
    description: "Latest frontier agentic coding model.",
    isDefault: true,
    hidden: false,
    defaultReasoningEffort: "high",
    supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
  });
  assert.deepEqual(
    models.find((model) => model.id === "gpt-5.1-codex-mini")?.supportedReasoningEfforts,
    ["medium", "high"],
  );
});
