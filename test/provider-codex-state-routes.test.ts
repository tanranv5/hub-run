import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import type { ProviderAdapter, ProviderSummary } from "../api/types";
import { readCookie } from "./helpers";

const PROVIDER_SUMMARY = {
  id: "codex",
  label: "Codex",
  description: "test",
  rootPath: "/tmp/codex",
  capabilities: {
    history: true,
    send: true,
    stream: false,
    attach: true,
    createSession: true,
    emptyCreateSession: false,
    modelSelection: true,
    threadState: true,
    interrupt: true,
    userInput: true,
  },
  status: {
    historyReadable: true,
    sendAvailable: true,
    configResolved: true,
    lastError: null,
  },
} as unknown as ProviderSummary;

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

function createRegistry(overrides: Record<string, unknown> = {}) {
  const adapter = {
    summary: PROVIDER_SUMMARY,
    listSessions: async () => [],
    listProjects: async () => [],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "session-created",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    ...overrides,
  } as unknown as ProviderAdapter;

  return {
    codex: adapter,
    claude: {
      ...adapter,
      summary: {
        ...PROVIDER_SUMMARY,
        id: "claude",
        label: "Claude",
      },
    } as ProviderAdapter,
  };
}

test("codex state route delegates to provider adapter", async () => {
  let captured:
    | {
        sessionId: string;
        requestedTurnId: string | null | undefined;
      }
    | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        getThreadState: async (
          sessionId: string,
          requestedTurnId?: string | null,
        ) => {
          captured = { sessionId, requestedTurnId };
          return {
            threadId: sessionId,
            activeTurnId: "turn-7",
            isGenerating: true,
            requestedTurnId: requestedTurnId ?? null,
            requestedTurnStatus: "inProgress",
          };
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/state?turnId=turn-7",
    {
      headers: { cookie },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    threadId: "session-1",
    activeTurnId: "turn-7",
    isGenerating: true,
    requestedTurnId: "turn-7",
    requestedTurnStatus: "inProgress",
  });
  assert.deepEqual(captured, {
    sessionId: "session-1",
    requestedTurnId: "turn-7",
  });
});

test("codex state route can expose the latest turn status even when no turnId is supplied", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        getThreadState: async () => ({
          threadId: "session-1",
          activeTurnId: null,
          isGenerating: false,
          requestedTurnId: "turn-8",
          requestedTurnStatus: "completed",
        }),
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions/session-1/state", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    threadId: "session-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-8",
    requestedTurnStatus: "completed",
  });
});

test("codex state route downgrades stale terminal snapshots when the latest message tail is newer", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        getConversationPage: async () => ({
          messages: [
            {
              id: "msg-1",
              role: "assistant",
              kind: "text",
              text: "更晚写入的最新消息",
              timestamp: "2026-03-27T07:40:04.631Z",
            },
          ],
          nextBefore: null,
          summary: null,
        }),
        getThreadState: async () => ({
          threadId: "session-1",
          activeTurnId: null,
          isGenerating: false,
          requestedTurnId: "turn-8",
          requestedTurnStatus: "interrupted",
          snapshotAt: "2026-03-27T07:29:58.000Z",
        }),
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions/session-1/state", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    threadId: "session-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-8",
    requestedTurnStatus: null,
    rawRequestedTurnStatus: "interrupted",
    desynced: true,
    desyncReason: "messageTailAheadOfThreadSnapshot",
    snapshotAt: "2026-03-27T07:29:58.000Z",
    latestMessageAt: "2026-03-27T07:40:04.631Z",
  });
});

test("codex state route marks the latest turn as stalled after prolonged inactivity", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        getConversationPage: async () => ({
          messages: [
            {
              id: "msg-1",
              role: "user",
              kind: "text",
              text: "继续执行",
              timestamp: "2026-03-27T07:40:04.631Z",
            },
          ],
          nextBefore: null,
          summary: null,
        }),
        getThreadState: async () => ({
          threadId: "session-1",
          activeTurnId: null,
          isGenerating: false,
          requestedTurnId: "turn-9",
          requestedTurnStatus: null,
          snapshotAt: "2026-03-27T07:29:58.000Z",
        }),
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions/session-1/state", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    threadId: "session-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-9",
    requestedTurnStatus: null,
    stalled: true,
    stallReason: "noRecentActivity",
    snapshotAt: "2026-03-27T07:29:58.000Z",
    latestMessageAt: "2026-03-27T07:40:04.631Z",
    lastActivityAt: "2026-03-27T07:40:04.631Z",
  });
});

test("codex state route does not mark waiting-input turns as stalled", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        getConversationPage: async () => ({
          messages: [
            {
              id: "msg-1",
              role: "assistant",
              kind: "tool_use",
              text: "请选择下一步",
              timestamp: "2026-03-27T07:40:04.631Z",
            },
          ],
          nextBefore: null,
          summary: null,
        }),
        getThreadState: async () => ({
          threadId: "session-1",
          activeTurnId: null,
          isGenerating: false,
          requestedTurnId: "turn-9",
          requestedTurnStatus: null,
          snapshotAt: "2026-03-27T07:29:58.000Z",
        }),
        listUserInputRequests: async () => [
          {
            requestId: "req-1",
            threadId: "session-1",
            turnId: "turn-9",
            itemId: "item-1",
            title: "继续执行",
            questions: [],
          },
        ],
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions/session-1/state", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    threadId: "session-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-9",
    requestedTurnStatus: null,
    snapshotAt: "2026-03-27T07:29:58.000Z",
  });
});

test("codex interrupt route delegates to provider adapter", async () => {
  let interruptedSessionId: string | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        interruptSession: async (sessionId: string) => {
          interruptedSessionId = sessionId;
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-9/interrupt",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(interruptedSessionId, "session-9");
});

test("codex state route returns 404 when the session no longer exists", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        getThreadState: async () => {
          throw new Error("thread not found: missing");
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions/missing/state", {
    headers: { cookie },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "SESSION_NOT_FOUND",
      message: "thread not found: missing",
    },
  });
});

test("codex interrupt route returns 404 when the session no longer exists", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        interruptSession: async () => {
          throw new Error("thread not found: missing");
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions/missing/interrupt", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
    },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "SESSION_NOT_FOUND",
      message: "thread not found: missing",
    },
  });
});

test("codex user input request routes delegate to provider adapter", async () => {
  let submitted:
    | {
        sessionId: string;
        requestId: string;
        answers: Record<string, { answers: string[] }>;
      }
    | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        listUserInputRequests: async (sessionId: string) => [
          {
            requestId: "req-1",
            threadId: sessionId,
            turnId: "turn-1",
            itemId: "item-1",
            questions: [
              {
                id: "confirm",
                header: "继续执行",
                question: "请选择后续动作",
                isOther: false,
                isSecret: false,
                options: [
                  {
                    label: "继续",
                    description: "批准继续执行",
                  },
                ],
              },
            ],
          },
        ],
        submitUserInput: async (
          sessionId: string,
          requestId: string,
          response: { answers: Record<string, { answers: string[] }> },
        ) => {
          submitted = {
            sessionId,
            requestId,
            answers: response.answers,
          };
        },
      }),
    },
  );

  const cookie = await login(app);
  const listResponse = await app.request(
    "/api/providers/codex/sessions/session-1/requests/user-input",
    {
      headers: { cookie },
    },
  );

  assert.equal(listResponse.status, 200);
  assert.deepEqual(await listResponse.json(), {
    requests: [
      {
        requestId: "req-1",
        threadId: "session-1",
        turnId: "turn-1",
        itemId: "item-1",
        questions: [
          {
            id: "confirm",
            header: "继续执行",
            question: "请选择后续动作",
            isOther: false,
            isSecret: false,
            options: [
              {
                label: "继续",
                description: "批准继续执行",
              },
            ],
          },
        ],
      },
    ],
  });

  const invalidResponse = await app.request(
    "/api/providers/codex/sessions/session-1/requests/user-input/req-1/respond",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ answers: [] }),
    },
  );

  assert.equal(invalidResponse.status, 400);

  const submitResponse = await app.request(
    "/api/providers/codex/sessions/session-1/requests/user-input/req-1/respond",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: {
          confirm: {
            answers: ["继续"],
          },
        },
      }),
    },
  );

  assert.equal(submitResponse.status, 200);
  assert.deepEqual(await submitResponse.json(), { ok: true });
  assert.deepEqual(submitted, {
    sessionId: "session-1",
    requestId: "req-1",
    answers: {
      confirm: {
        answers: ["继续"],
      },
    },
  });
});
