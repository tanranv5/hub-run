import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import { readCookie } from "./helpers";

async function login(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:12001",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  assert.equal(response.status, 200);
  return readCookie(response.headers.get("set-cookie"));
}

function createFixtureApp(homeDir: string) {
  process.env.HOME = homeDir;
  return createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
  );
}

test("codex latest page uses opaque tail cursor for long session and supports older page", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "hub-run-cache-home-"));
  const codexDir = join(homeDir, ".codex");
  const sessionDir = join(codexDir, "sessions", "2026", "03", "20");
  const sessionFile = join(
    sessionDir,
    "rollout-2026-03-20T09-00-00-long-session.jsonl",
  );

  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(codexDir, "history.jsonl"),
    `${JSON.stringify({
      session_id: "long-session",
      ts: 1_742_430_000,
      text: "长会话缓存测试",
    })}\n`,
    "utf-8",
  );

  const lines = [
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: "long-session",
        cwd: "/workspace/long-session",
        timestamp: "2026-03-20T09:00:00.000Z",
      },
    }),
  ];
  for (let index = 0; index < 900; index += 1) {
    lines.push(
      JSON.stringify({
        type: "response_item",
        timestamp: `2026-03-20T09:${String(index % 60).padStart(2, "0")}:00.000Z`,
        payload: {
          type: "message",
          role: index % 2 === 0 ? "user" : "assistant",
          content: [
            {
              type: index % 2 === 0 ? "input_text" : "output_text",
              text: `message-${index}`,
            },
          ],
        },
      }),
    );
  }
  await writeFile(sessionFile, `${lines.join("\n")}\n`, "utf-8");

  try {
    const app = createFixtureApp(homeDir);
    const cookie = await login(app);

    const latestResponse = await app.request(
      "/api/providers/codex/sessions/long-session/messages?limit=2",
      { headers: { cookie } },
    );

    assert.equal(latestResponse.status, 200);
    const latestPayload = await latestResponse.json();
    assert.match(latestPayload.nextBefore ?? "", /^tail:\d+:\d+$/);
    assert.equal(latestPayload.messages[0]?.text, "message-898");
    assert.equal(latestPayload.messages[1]?.text, "message-899");

    const olderResponse = await app.request(
      `/api/providers/codex/sessions/long-session/messages?limit=2&before=${encodeURIComponent(latestPayload.nextBefore)}`,
      { headers: { cookie } },
    );

    assert.equal(olderResponse.status, 200);
    const olderPayload = await olderResponse.json();
    assert.equal(olderPayload.messages[0]?.text, "message-896");
    assert.equal(olderPayload.messages[1]?.text, "message-897");
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test("codex watcher invalidates cached session display after file change", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "hub-run-watch-home-"));
  const codexDir = join(homeDir, ".codex");
  const sessionDir = join(codexDir, "sessions", "2026", "03", "20");
  const sessionFile = join(
    sessionDir,
    "rollout-2026-03-20T10-00-00-watch-session.jsonl",
  );

  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(codexDir, "history.jsonl"),
    `${JSON.stringify({
      session_id: "watch-session",
      ts: 1_742_430_100,
      text: "旧标题",
    })}\n`,
    "utf-8",
  );

  async function writeSession(prompt: string) {
    await writeFile(
      sessionFile,
      `${[
        JSON.stringify({
          type: "session_meta",
          payload: {
            id: "watch-session",
            cwd: "/workspace/watch-session",
            timestamp: "2026-03-20T10:00:00.000Z",
          },
        }),
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        }),
      ].join("\n")}\n`,
      "utf-8",
    );
  }

  await writeSession("旧标题");

  try {
    const app = createFixtureApp(homeDir);
    const cookie = await login(app);

    const firstResponse = await app.request("/api/providers/codex/sessions", {
      headers: { cookie },
    });
    const firstPayload = await firstResponse.json();
    assert.equal(firstPayload.sessions[0]?.display, "旧标题");

    await writeSession("新标题");
    await sleep(120);

    const secondResponse = await app.request("/api/providers/codex/sessions", {
      headers: { cookie },
    });
    const secondPayload = await secondResponse.json();
    assert.equal(secondPayload.sessions[0]?.display, "新标题");
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
