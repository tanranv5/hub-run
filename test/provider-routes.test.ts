import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import type { ProviderAdapter, ProviderSummary } from "../api/types";
import { readCookie } from "./helpers";

const FIXTURE_HOME = resolve(
  "/Users/tanran/aiCode/cw/hub-run/test/fixtures/home",
);
const FIXTURE_CODEX_STATE_DB = resolve(FIXTURE_HOME, ".codex/state_5.sqlite");
const FIXTURE_THREAD_TS = 1768784400;

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

function createFixtureApp() {
  process.env.HOME = FIXTURE_HOME;
  return createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
  );
}

function insertFixtureThread(options: {
  id: string;
  source: string;
  agentRole: string | null;
  agentNickname?: string | null;
}): () => void {
  const database = new DatabaseSync(FIXTURE_CODEX_STATE_DB);
  try {
    database
      .prepare(
        `insert into threads (
          id, rollout_path, created_at, updated_at, source, model_provider, cwd,
          title, sandbox_policy, approval_mode, agent_nickname, agent_role
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        options.id,
        `/tmp/${options.id}.jsonl`,
        FIXTURE_THREAD_TS,
        FIXTURE_THREAD_TS,
        options.source,
        "openai",
        "/workspace/release-app",
        "fixture thread",
        "danger-full-access",
        "never",
        options.agentNickname ?? null,
        options.agentRole,
      );
  } finally {
    database.close();
  }

  return () => {
    const cleanupDatabase = new DatabaseSync(FIXTURE_CODEX_STATE_DB);
    try {
      cleanupDatabase.prepare("delete from threads where id = ?").run(options.id);
    } finally {
      cleanupDatabase.close();
    }
  };
}

function createMutableSummary(sendAvailable: boolean): ProviderSummary {
  return {
    id: "codex",
    label: "Codex",
    description: "dynamic",
    rootPath: "/tmp/codex",
    capabilities: {
      history: true,
      send: sendAvailable,
      stream: false,
      attach: sendAvailable,
      createSession: sendAvailable,
      emptyCreateSession: false,
      modelSelection: sendAvailable,
      threadState: false,
      interrupt: false,
      userInput: false,
    },
    status: {
      historyReadable: true,
      sendAvailable,
      configResolved: true,
      lastError: sendAvailable
        ? null
        : {
            code: "TRANSPORT_UNAVAILABLE",
            message: "Send transport is unavailable",
          },
    },
  };
}

async function createFixtureCodexSessionFile(options: {
  id: string;
  lines: string[];
  rolloutFileName: string;
}) {
  const filePath = resolve(
    FIXTURE_HOME,
    `.codex/sessions/2026/01/19/${options.rolloutFileName}`,
  );
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, `${options.lines.join("\n")}\n`, "utf-8");
  return async () => {
    await rm(filePath, { force: true });
  };
}

test("codex sessions route returns fixture-backed sessions", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.sessions.length, 3);
  assert.equal(payload.nextBefore, null);
  assert.equal(payload.totalCount, 3);
  assert.equal(payload.sessions[0].id, "codex-session-3");
  assert.equal(payload.sessions[1].projectName, "release-app");
});

test("codex sessions route hides subagent threads from session list", async () => {
  const cleanup = insertFixtureThread({
    id: "codex-session-2",
    source:
      '{"subagent":{"thread_spawn":{"parent_thread_id":"codex-session-1","depth":1,"agent_nickname":"Mendel","agent_role":"reviewer"}}}',
    agentRole: "reviewer",
    agentNickname: "Mendel",
  });

  try {
    const app = createFixtureApp();
    const cookie = await login(app);
    const response = await app.request("/api/providers/codex/sessions", {
      headers: { cookie },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(
      payload.sessions.map((session: { id: string }) => session.id),
      ["codex-session-3", "codex-session-1"],
    );
  } finally {
    cleanup();
  }
});

test("codex sessions route hides sessions without meaningful user title", async () => {
  const cleanup = await createFixtureCodexSessionFile({
    id: "codex-session-empty",
    rolloutFileName: "rollout-2026-01-19T11-00-00-codex-session-empty.jsonl",
    lines: [
      JSON.stringify({
        timestamp: "2026-01-19T11:00:00.000Z",
        type: "session_meta",
        payload: {
          id: "codex-session-empty",
          timestamp: "2026-01-19T11:00:00.000Z",
          cwd: "/workspace/no-title",
        },
      }),
      JSON.stringify({
        timestamp: "2026-01-19T11:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "# AGENTS.md instructions for /workspace/no-title\n" +
                "<environment_context>\n<cwd>/workspace/no-title</cwd>\n</environment_context>",
            },
          ],
        },
      }),
    ],
  });

  try {
    const app = createFixtureApp();
    const cookie = await login(app);
    const response = await app.request("/api/providers/codex/sessions", {
      headers: { cookie },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(
      payload.sessions.some((session: { id: string }) => session.id === "codex-session-empty"),
      false,
    );
  } finally {
    await cleanup();
  }
});

test("provider summary routes and create route use live provider status instead of boot snapshot", async () => {
  let sendAvailable = false;
  const dynamicAdapter = {
    summary: createMutableSummary(false),
    getSummary: () => createMutableSummary(sendAvailable),
    listSessions: async () => [],
    listProjects: async () => [],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "dynamic-session",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
  } as unknown as ProviderAdapter;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: dynamicAdapter,
        claude: {
          ...dynamicAdapter,
          summary: {
            ...createMutableSummary(true),
            id: "claude",
            label: "Claude",
          },
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const initialStatus = await app.request("/api/providers/codex/status", {
    headers: { cookie },
  });
  assert.equal(initialStatus.status, 200);
  assert.deepEqual(await initialStatus.json(), {
    provider: createMutableSummary(false),
  });

  sendAvailable = true;

  const providersResponse = await app.request("/api/providers", {
    headers: { cookie },
  });
  assert.equal(providersResponse.status, 200);
  const providersPayload = await providersResponse.json();
  const codexProvider = providersPayload.providers.find(
    (provider: { id: string }) => provider.id === "codex",
  );
  assert.deepEqual(codexProvider, createMutableSummary(true));

  const createResponse = await app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/tmp/project",
      text: "hello",
    }),
  });
  assert.equal(createResponse.status, 200);
  assert.deepEqual(await createResponse.json(), {
    ok: true,
    sessionId: "dynamic-session",
    turnId: null,
  });
});

test("codex projects route includes session-meta projects missing from history", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/projects", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.projects, [
    "/workspace/codex-app",
    "/workspace/ops-center",
    "/workspace/release-app",
  ]);
});

test("codex models route returns static CLI-backed model metadata", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/models", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.models, [
    {
      id: "gpt-5.3-codex",
      displayName: "gpt-5.3-codex",
      description: "Latest frontier agentic coding model.",
      isDefault: true,
      hidden: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.4",
      displayName: "gpt-5.4",
      description: "Latest frontier agentic coding model.",
      isDefault: false,
      hidden: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.2-codex",
      displayName: "gpt-5.2-codex",
      description: "Frontier agentic coding model.",
      isDefault: false,
      hidden: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.1-codex-max",
      displayName: "gpt-5.1-codex-max",
      description: "Codex-optimized flagship for deep and fast reasoning.",
      isDefault: false,
      hidden: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.2",
      displayName: "gpt-5.2",
      description:
        "Latest frontier model with improvements across knowledge, reasoning and coding",
      isDefault: false,
      hidden: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
    },
    {
      id: "gpt-5.1-codex-mini",
      displayName: "gpt-5.1-codex-mini",
      description: "Optimized for codex. Cheaper, faster, but less capable.",
      isDefault: false,
      hidden: false,
      defaultReasoningEffort: "high",
      supportedReasoningEfforts: ["medium", "high"],
    },
  ]);
});

test("claude projects route returns distinct projects", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);
  const response = await app.request("/api/providers/claude/projects", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.projects, [
    "/workspace/claude-app",
    "/workspace/claude-audit",
    "/workspace/claude-report",
  ]);
});

test("claude sessions route includes project files missing from history", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);
  const response = await app.request("/api/providers/claude/sessions", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.sessions.length, 3);
  assert.equal(payload.sessions[0].id, "claude-session-3");
  assert.equal(payload.sessions[0].project, "/workspace/claude-audit");
  assert.equal(payload.sessions[0].display, "补齐审计日志字段");
});

test("claude sessions route sanitizes session title noise from history and files", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);
  const response = await app.request("/api/providers/claude/sessions", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  const appSession = payload.sessions.find(
    (session: { id: string }) => session.id === "claude-session-1",
  );

  assert.equal(appSession?.display, "修复支付超时");
});

test("sessions route paginates latest items first and supports before cursor", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);

  const latestResponse = await app.request(
    "/api/providers/codex/sessions?limit=2",
    {
      headers: { cookie },
    },
  );

  assert.equal(latestResponse.status, 200);
  const latestPayload = await latestResponse.json();
  assert.equal(latestPayload.sessions.length, 2);
  assert.equal(latestPayload.sessions[0].id, "codex-session-3");
  assert.equal(latestPayload.sessions[1].id, "codex-session-2");
  assert.equal(latestPayload.nextBefore, "2");

  const olderResponse = await app.request(
    "/api/providers/codex/sessions?limit=2&before=2",
    {
      headers: { cookie },
    },
  );

  assert.equal(olderResponse.status, 200);
  const olderPayload = await olderResponse.json();
  assert.equal(olderPayload.sessions.length, 1);
  assert.equal(olderPayload.sessions[0].id, "codex-session-1");
  assert.equal(olderPayload.nextBefore, null);
});

test("sessions route filters by exact project before pagination", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);

  const response = await app.request(
    "/api/providers/codex/sessions?project=%2Fworkspace%2Fops-center",
    {
      headers: { cookie },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.sessions.length, 1);
  assert.equal(payload.sessions[0].project, "/workspace/ops-center");
  assert.equal(payload.nextBefore, null);
});

test("codex message route loads latest page first and older page via before cursor", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);

  const latestResponse = await app.request(
    "/api/providers/codex/sessions/codex-session-1/messages?limit=2",
    {
      headers: { cookie },
    },
  );

  assert.equal(latestResponse.status, 200);
  const latestPayload = await latestResponse.json();
  assert.equal(latestPayload.messages.length, 2);
  assert.equal(latestPayload.messages[0].kind, "tool_use");
  assert.equal(latestPayload.messages[1].kind, "tool_result");
  assert.equal(latestPayload.nextBefore, "3");

  const olderResponse = await app.request(
    "/api/providers/codex/sessions/codex-session-1/messages?limit=2&before=3",
    {
      headers: { cookie },
    },
  );

  assert.equal(olderResponse.status, 200);
  const olderPayload = await olderResponse.json();
  assert.equal(olderPayload.messages.length, 2);
  assert.equal(olderPayload.messages[0].kind, "text");
  assert.equal(olderPayload.messages[1].kind, "thinking");
  assert.equal(olderPayload.nextBefore, "1");

  const oldestResponse = await app.request(
    "/api/providers/codex/sessions/codex-session-1/messages?limit=2&before=1",
    {
      headers: { cookie },
    },
  );

  assert.equal(oldestResponse.status, 200);
  const oldestPayload = await oldestResponse.json();
  assert.equal(oldestPayload.messages.length, 1);
  assert.equal(oldestPayload.messages[0].role, "user");
  assert.equal(oldestPayload.messages[0].kind, "text");
  assert.equal(oldestPayload.nextBefore, null);
});

test("claude message route preserves summary and latest-first order", async () => {
  const app = createFixtureApp();
  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/claude/sessions/claude-session-1/messages?limit=2",
    {
      headers: { cookie },
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.messages.length, 2);
  assert.equal(payload.messages[0].kind, "tool_use");
  assert.equal(payload.messages[1].kind, "tool_result");
  assert.equal(payload.summary?.text, "支付问题排查");
});
