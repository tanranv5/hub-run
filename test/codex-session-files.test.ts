import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readCodexConversation,
  readCodexFirstUserSnippet,
} from "../api/providers/sources/codex-session-files";

test("codex first user snippet skips pure instructions wrapper and picks next real prompt", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-codex-session-"));
  const filePath = join(tempDir, "session.jsonl");
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: "session-1",
        cwd: "/Users/tanran/aiCode/jetra",
        timestamp: "2025-10-09T04:03:18.601Z",
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "<user_instructions>\nAGENTS.md - 全局配置模板\n请始终使用中文回答\n</user_instructions>",
          },
        ],
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "# Context from my IDE setup:\n" +
              "## My request for Codex:\n" +
              "把这个网站https://ckey.run/用curl下载下来到当前目录，要完整的哦。",
          },
        ],
      },
    }),
  ];

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const display = await readCodexFirstUserSnippet(filePath);
    assert.equal(
      display,
      "把这个网站https://ckey.run/用curl下载下来到当前目录，要完整的哦。",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("codex first user snippet skips AGENTS boilerplate user message and keeps real task title", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-codex-session-"));
  const filePath = join(tempDir, "session.jsonl");
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: "session-3",
        cwd: "/Users/tanran/aiCode/cw",
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Files called AGENTS.md commonly appear in many places inside a container - at \"/\", in \"~\", deep within git repositories, or in any other directory; their location is not limited to version-controlled folders.\n" +
              "Their purpose is to pass along human guidance to you, the agent.\n" +
              "Each AGENTS.md governs the entire directory that contains it and every child directory beneath that point.\n" +
              "When two AGENTS.md files disagree, the one located deeper in the directory structure overrides the higher-level file.",
          },
        ],
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "查看当前的/Users/tanran/aiCode/frida-ctf/ks/ks_new.chlz。里面有个rest/n/live/draw/goldturntable/home。",
          },
        ],
      },
    }),
  ];

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const display = await readCodexFirstUserSnippet(filePath);
    assert.equal(
      display,
      "查看当前的/Users/tanran/aiCode/frida-ctf/ks/ks_new.chlz。里面有个rest/n/live/draw/goldturntable/home。",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("codex first user snippet skips image placeholder blocks and keeps later text in the same message", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-codex-session-"));
  const filePath = join(tempDir, "session.jsonl");
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: "session-image",
        cwd: "/Users/tanran/aiCode/cw/hub-run",
      },
    }),
    JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "<image name=[Image #1]>",
          },
          {
            type: "input_text",
            text: "</image>",
          },
          {
            type: "input_text",
            text: "[Image #1]现在会话有空会话，顺手把标题也修一下",
          },
        ],
      },
    }),
  ];

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const display = await readCodexFirstUserSnippet(filePath);
    assert.equal(display, "现在会话有空会话，顺手把标题也修一下");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("codex conversation parser keeps tool events, reasoning, and context statuses but drops token telemetry noise", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-codex-conversation-"));
  const filePath = join(tempDir, "session.jsonl");
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: { id: "session-2", cwd: "/workspace/demo" },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-03-19T00:00:01.000Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "检查最近构建日志" }],
      },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-03-19T00:00:02.000Z",
      payload: {
        type: "function_call",
        name: "exec_command",
        call_id: "call-1",
        arguments: { cmd: "npm test" },
      },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-03-19T00:00:03.000Z",
      payload: {
        type: "function_call_output",
        call_id: "call-1",
        output: "tests passed",
      },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-03-19T00:00:04.000Z",
      payload: {
        type: "agent_reasoning",
        text: "先确认失败用例来自哪个模块。",
      },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-03-19T00:00:05.000Z",
      payload: {
        type: "turn_context",
        cwd: "/workspace/demo",
        model: "gpt-5.4",
        timezone: "Asia/Shanghai",
        collaboration_mode: {
          settings: {
            reasoning_effort: "high",
          },
        },
      },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-03-19T00:00:06.000Z",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: { total_tokens: 3210 },
          model_context_window: 258400,
        },
      },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-03-19T00:00:07.000Z",
      payload: {
        type: "turn_aborted",
        reason: "interrupt_requested",
      },
    }),
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const messages = await readCodexConversation(filePath, "session-2");
    assert.equal(messages.length, 6);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[0]?.kind, "text");
    assert.equal(messages[1]?.kind, "tool_use");
    assert.equal(messages[1]?.title, "exec_command");
    assert.equal(messages[1]?.block?.type, "tool_use");
    assert.equal(messages[1]?.block?.name, "exec_command");
    assert.deepEqual(messages[1]?.block?.input, { cmd: "npm test" });
    assert.equal(messages[2]?.kind, "tool_result");
    assert.equal(messages[2]?.title, "exec_command");
    assert.equal(messages[2]?.block?.type, "tool_result");
    assert.equal(messages[2]?.block?.toolUseId, "call-1");
    assert.equal(messages[2]?.block?.content, "tests passed");
    assert.equal(messages[3]?.kind, "thinking");
    assert.equal(messages[4]?.role, "system");
    assert.equal(messages[4]?.title, "context");
    assert.match(messages[4]?.text ?? "", /cwd=\/workspace\/demo/);
    assert.equal(messages[5]?.kind, "turn_aborted");
    assert.equal(messages[5]?.block?.type, "turn_aborted");
    assert.match(messages[5]?.text ?? "", /interrupt_requested/);
    assert.equal(
      messages.some(
        (message) =>
          /本轮 tokens=|上下文窗口=/.test(message.text) ||
          message.title === "token_count",
      ),
      false,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("codex conversation parser keeps task_started after the triggering user message", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-codex-task-started-"));
  const filePath = join(tempDir, "session.jsonl");
  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: { id: "session-3", cwd: "/workspace/demo" },
    }),
    JSON.stringify({
      type: "event_msg",
      timestamp: "2026-03-19T00:10:00.000Z",
      payload: {
        type: "task_started",
        turn_id: "turn-1",
      },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-03-19T00:10:00.500Z",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "继续修复排序问题" }],
      },
    }),
    JSON.stringify({
      type: "response_item",
      timestamp: "2026-03-19T00:10:01.000Z",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "收到，开始处理。" }],
      },
    }),
  ];

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const messages = await readCodexConversation(filePath, "session-3");
    assert.equal(messages.length, 3);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[0]?.text, "继续修复排序问题");
    assert.equal(messages[1]?.role, "system");
    assert.match(messages[1]?.text ?? "", /任务已开始/);
    assert.equal(messages[2]?.role, "assistant");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
