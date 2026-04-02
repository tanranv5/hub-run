import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createClaudeSessionStore } from "../api/providers/sources/claude-store";
import { encodeProjectPath } from "../api/providers/sources/claude-session-files";
import { createCodexSessionStore } from "../api/providers/sources/codex-store";

test("codex store search and locate respect current message mode", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "hub-run-search-codex-"));
  const codexDir = join(homeDir, ".codex");
  const sessionDir = join(codexDir, "sessions", "2026", "04", "02");
  const sessionFile = join(sessionDir, "rollout-2026-04-02T01-00-00-search-codex.jsonl");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(codexDir, "history.jsonl"),
    `${JSON.stringify({ session_id: "search-codex", ts: 1_775_059_200, text: "search codex" })}\n`,
    "utf-8",
  );
  await writeFile(
    sessionFile,
    `${[
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "search-codex",
          cwd: "/workspace/search-codex",
          timestamp: "2026-04-02T01:00:00.000Z",
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-04-02T01:00:01.000Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "alpha 用户消息" }],
        },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-04-02T01:00:02.000Z",
        payload: { type: "task_started", turn_id: "turn-1" },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-04-02T01:00:03.000Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "beta 助手回复" }],
        },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-04-02T01:00:04.000Z",
        payload: { type: "agent_reasoning", text: "hidden think trace" },
      }),
      JSON.stringify({
        type: "event_msg",
        timestamp: "2026-04-02T01:00:05.000Z",
        payload: { type: "task_complete", turn_id: "turn-1" },
      }),
    ].join("\n")}\n`,
    "utf-8",
  );

  const store = createCodexSessionStore(codexDir);
  try {
    const allResult = await store.searchConversation("search-codex", "hidden", "all");
    assert.equal(allResult.totalHits, 1);
    assert.equal(allResult.hits[0]?.kind, "thinking");

    const compactResult = await store.searchConversation("search-codex", "任务已完成", "compact");
    assert.equal(compactResult.totalMessages, 4);
    assert.equal(compactResult.totalHits, 1);
    assert.equal(compactResult.hits[0]?.preview.includes("任务已完成"), true);
    assert.equal(typeof compactResult.hits[0]?.anchor.offset, "number");
    assert.equal(compactResult.hits[0]?.anchor.blockIndex, 0);

    const textResult = await store.searchConversation("search-codex", "alpha", "text");
    assert.equal(textResult.totalMessages, 2);
    assert.equal(textResult.totalHits, 1);
    assert.equal(textResult.hits[0]?.role, "user");

    const located = await store.locateConversation(
      "search-codex",
      textResult.hits[0]!.messageId,
      "text",
      2,
    );
    assert.ok(located);
    assert.deepEqual(
      located?.messages.map((message) => message.text),
      ["alpha 用户消息", "beta 助手回复"],
    );

    const context = await store.readConversationContext?.(
      "search-codex",
      compactResult.hits[0]!.anchor,
      "compact",
      2,
    );
    assert.ok(context);
    assert.equal(context?.hitMessageId, compactResult.hits[0]?.messageId);
    assert.deepEqual(context?.messages.map((message) => message.text), [
      "beta 助手回复",
      "任务已完成（turn=turn-1）",
    ]);
  } finally {
    store.destroy();
    await rm(homeDir, { recursive: true, force: true });
  }
});

test("claude store search and locate filter tool cards out of compact and text mode", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "hub-run-search-claude-"));
  const claudeDir = join(homeDir, ".claude");
  const projectPath = "/workspace/search-claude";
  const encodedProject = encodeProjectPath(projectPath);
  const projectDir = join(claudeDir, "projects", encodedProject);
  const sessionFile = join(projectDir, "search-claude.jsonl");
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    join(claudeDir, "history.jsonl"),
    `${JSON.stringify({
      sessionId: "search-claude",
      display: "search claude",
      timestamp: 1_775_059_500_000,
      project: projectPath,
    })}\n`,
    "utf-8",
  );
  await writeFile(
    sessionFile,
    `${[
      JSON.stringify({
        timestamp: "2026-04-02T01:05:00.000Z",
        cwd: projectPath,
        message: {
          role: "user",
          content: [{ type: "text", text: "gamma 用户问题" }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-02T01:05:01.000Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name: "bash", input: { command: "ls" } }],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-02T01:05:02.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "gamma 助手文本回复" }],
        },
      }),
    ].join("\n")}\n`,
    "utf-8",
  );

  const store = createClaudeSessionStore(claudeDir);
  try {
    const allResult = await store.searchConversation("search-claude", "bash", "all");
    assert.equal(allResult.totalHits, 1);
    assert.equal(allResult.hits[0]?.kind, "tool_use");

    const compactResult = await store.searchConversation("search-claude", "bash", "compact");
    assert.equal(compactResult.totalHits, 0);
    assert.equal(compactResult.totalMessages, 2);

    const textResult = await store.searchConversation("search-claude", "gamma", "text");
    assert.equal(textResult.totalMessages, 2);
    assert.equal(textResult.totalHits, 2);
    assert.equal(typeof textResult.hits[1]?.anchor.offset, "number");
    assert.equal(textResult.hits[1]?.anchor.blockIndex, 0);

    const located = await store.locateConversation(
      "search-claude",
      textResult.hits[1]!.messageId,
      "text",
      2,
    );
    assert.ok(located);
    assert.deepEqual(
      located?.messages.map((message) => message.text),
      ["gamma 用户问题", "gamma 助手文本回复"],
    );

    const context = await store.readConversationContext?.(
      "search-claude",
      textResult.hits[1]!.anchor,
      "text",
      2,
    );
    assert.ok(context);
    assert.equal(context?.hitMessageId, textResult.hits[1]?.messageId);
  } finally {
    store.destroy();
    await rm(homeDir, { recursive: true, force: true });
  }
});

test("searchConversationPage paginates by anchor and preserves same-line block order", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "hub-run-search-page-codex-"));
  const codexDir = join(homeDir, ".codex");
  const sessionDir = join(codexDir, "sessions", "2026", "04", "02");
  const sessionFile = join(sessionDir, "rollout-2026-04-02T02-00-00-search-page.jsonl");
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(codexDir, "history.jsonl"),
    `${JSON.stringify({ session_id: "search-page-codex", ts: 1_775_059_800, text: "search page codex" })}\n`,
    "utf-8",
  );
  await writeFile(
    sessionFile,
    `${[
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: "search-page-codex",
          cwd: "/workspace/search-page-codex",
          timestamp: "2026-04-02T02:00:00.000Z",
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-04-02T02:00:01.000Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "anchor 命中一" },
            { type: "output_text", text: "anchor 命中二" },
          ],
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-04-02T02:00:02.000Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "anchor 命中三" }],
        },
      }),
    ].join("\n")}\n`,
    "utf-8",
  );

  const store = createCodexSessionStore(codexDir);
  try {
    const firstPage = await store.searchConversationPage?.(
      "search-page-codex",
      "anchor",
      "text",
      null,
      1,
    );
    assert.ok(firstPage);
    assert.equal(firstPage?.hits.length, 1);
    assert.equal(firstPage?.hits[0]?.anchor.blockIndex, 0);
    assert.deepEqual(firstPage?.nextAnchor, firstPage?.hits[0]?.anchor);

    const secondPage = await store.searchConversationPage?.(
      "search-page-codex",
      "anchor",
      "text",
      firstPage?.nextAnchor ?? null,
      1,
    );
    assert.ok(secondPage);
    assert.equal(secondPage?.hits.length, 1);
    assert.equal(secondPage?.hits[0]?.anchor.blockIndex, 1);
    assert.deepEqual(secondPage?.nextAnchor, secondPage?.hits[0]?.anchor);

    const thirdPage = await store.searchConversationPage?.(
      "search-page-codex",
      "anchor",
      "text",
      secondPage?.nextAnchor ?? null,
      1,
    );
    assert.ok(thirdPage);
    assert.equal(thirdPage?.hits.length, 1);
    assert.equal(thirdPage?.hits[0]?.anchor.blockIndex, 0);
    assert.equal(thirdPage?.nextAnchor, null);
  } finally {
    store.destroy();
    await rm(homeDir, { recursive: true, force: true });
  }
});
