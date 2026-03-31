import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import type { ProviderAdapter, ProviderSummary } from "../api/types";
import { readCookie } from "./helpers";

const PROVIDER_SUMMARY: ProviderSummary = {
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
    deleteSession: true,
  },
  status: {
    historyReadable: true,
    sendAvailable: true,
    configResolved: true,
    lastError: null,
  },
};

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

function createRegistry(overrides: Partial<ProviderAdapter>) {
  const adapter: ProviderAdapter = {
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
    deleteSession: async () => undefined,
    ...overrides,
  };

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

test("provider delete session route delegates to provider adapter", async () => {
  let capturedSessionId: string | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        deleteSession: async (sessionId: string) => {
          capturedSessionId = sessionId;
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/claude/sessions/session-1", {
    method: "DELETE",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(capturedSessionId, "session-1");
});
