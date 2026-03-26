import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readCodexSessionContext } from "../api/providers/sources/codex-session-context";

test("codex session context reads model effort and context window from recent records", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-codex-context-"));
  const filePath = join(tempDir, "session.jsonl");
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: { id: "session-1", cwd: "/workspace/demo" },
    }),
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "task_started",
        model: "gpt-5.4",
        collaboration_mode: {
          settings: {
            reasoning_effort: "high",
          },
        },
      },
    }),
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { total_tokens: 129200 },
          model_context_window: 258400,
        },
      },
    }),
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const context = await readCodexSessionContext(filePath, "session-1");
    assert.deepEqual(context, {
      contextLeftPercent: 50,
      modelContextWindow: 258400,
      modelId: "gpt-5.4",
      reasoningEffort: "high",
      sessionId: "session-1",
      usedTokens: 129200,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("codex session context leaves context percent unknown when only window size is known", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-codex-context-"));
  const filePath = join(tempDir, "session.jsonl");
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: { id: "session-2", cwd: "/workspace/demo" },
    }),
    JSON.stringify({
      type: "event_msg",
      payload: {
        type: "task_started",
        model: "gpt-5.4-mini",
        model_context_window: 200000,
      },
    }),
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const context = await readCodexSessionContext(filePath, "session-2");
    assert.equal(context.contextLeftPercent, null);
    assert.equal(context.modelContextWindow, 200000);
    assert.equal(context.modelId, "gpt-5.4-mini");
    assert.equal(context.usedTokens, null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
