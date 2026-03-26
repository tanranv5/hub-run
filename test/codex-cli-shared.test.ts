import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodexCliArgs,
  parseCodexCliJsonLines,
} from "../api/providers/transports/codex-cli-shared";

test("buildCodexCliArgs builds create command with model and effort", () => {
  const args = buildCodexCliArgs({
    cwd: "/Users/tanran/aiCode/cw/hub-run",
    mode: "create",
    text: "创建新会话并发送首条消息",
    model: "gpt-5.3-codex",
    effort: "high",
  });

  assert.deepEqual(args, [
    "exec",
    "-C",
    "/Users/tanran/aiCode/cw/hub-run",
    "-m",
    "gpt-5.3-codex",
    "-c",
    'model_reasoning_effort="high"',
    "创建新会话并发送首条消息",
    "--json",
    "--skip-git-repo-check",
  ]);
});

test("buildCodexCliArgs builds resume command for existing session", () => {
  const args = buildCodexCliArgs({
    cwd: "/Users/tanran/aiCode/cw/hub-run",
    mode: "resume",
    sessionId: "session-123",
    text: "继续发消息",
    model: "gpt-5.3-codex",
    effort: "high",
  });

  assert.deepEqual(args, [
    "exec",
    "-C",
    "/Users/tanran/aiCode/cw/hub-run",
    "-m",
    "gpt-5.3-codex",
    "-c",
    'model_reasoning_effort="high"',
    "resume",
    "session-123",
    "继续发消息",
    "--json",
    "--skip-git-repo-check",
  ]);
});

test("parseCodexCliJsonLines extracts created session id and last agent message", () => {
  const result = parseCodexCliJsonLines([
    '{"type":"thread.started","thread_id":"session-created"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"第一条回复"}}',
    '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"最终回复"}}',
    '{"type":"turn.completed"}',
  ].join("\n"));

  assert.deepEqual(result, {
    outputText: "最终回复",
    sessionId: "session-created",
  });
});
