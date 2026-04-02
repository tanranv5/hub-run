import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import type {
  ConversationContextResult,
  ConversationLocateResult,
  ConversationSearchPageResult,
  ConversationSearchResult,
  ProviderAdapter,
  ProviderSummary,
} from "../api/types";
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
    threadState: false,
    interrupt: false,
    userInput: false,
    deleteSession: false,
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

function createRegistry(overrides: Partial<ProviderAdapter> = {}) {
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
    ...overrides,
  };

  return {
    codex: adapter,
    claude: {
      ...adapter,
      summary: { ...PROVIDER_SUMMARY, id: "claude", label: "Claude" },
    } as ProviderAdapter,
  };
}

test("conversation search route delegates to provider adapter", async () => {
  let captured:
    | { mode: string; query: string; sessionId: string }
    | null = null;
  const result: ConversationSearchResult = {
    query: "alpha",
    mode: "text",
    totalMessages: 2,
    totalHits: 1,
    hits: [{
      anchor: { offset: 128, blockIndex: 0 },
      messageId: "message-1",
      messageIndex: 0,
      role: "assistant",
      kind: "text",
      preview: "alpha 命中",
      ranges: [{ start: 0, end: 5 }],
    }],
  };
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        searchConversation: async (sessionId, query, mode) => {
          captured = { sessionId, query, mode };
          return result;
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages/search?q=alpha&mode=text",
    { headers: { cookie } },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  assert.deepEqual(captured, {
    sessionId: "session-1",
    query: "alpha",
    mode: "text",
  });
});

test("conversation search route validates q and mode", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        searchConversation: async () => ({
          query: "alpha",
          mode: "all",
          totalMessages: 0,
          totalHits: 0,
          hits: [],
        }),
      }),
    },
  );

  const cookie = await login(app);
  const missingQuery = await app.request(
    "/api/providers/codex/sessions/session-1/messages/search?mode=all",
    { headers: { cookie } },
  );
  assert.equal(missingQuery.status, 400);

  const invalidMode = await app.request(
    "/api/providers/codex/sessions/session-1/messages/search?q=alpha&mode=weird",
    { headers: { cookie } },
  );
  assert.equal(invalidMode.status, 400);
});

test("conversation search page route delegates anchor cursor to provider adapter", async () => {
  let captured:
    | {
        blockIndex: number | null;
        limit: number;
        mode: string;
        offset: number | null;
        query: string;
        sessionId: string;
      }
    | null = null;
  const result: ConversationSearchPageResult = {
    query: "alpha",
    mode: "compact",
    totalHits: 23,
    hits: [{
      anchor: { offset: 512, blockIndex: 2 },
      messageId: "message-9",
      messageIndex: 0,
      role: "assistant",
      kind: "text",
      preview: "alpha 命中分页",
      ranges: [{ start: 0, end: 5 }],
    }],
    nextAnchor: { offset: 512, blockIndex: 2 },
  };
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        searchConversationPage: async (sessionId, query, mode, anchor, limit) => {
          captured = {
            sessionId,
            query,
            mode,
            offset: anchor?.offset ?? null,
            blockIndex: anchor?.blockIndex ?? null,
            limit,
          };
          return result;
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages/search-page?q=alpha&mode=compact&afterOffset=256&afterBlockIndex=1&limit=12",
    { headers: { cookie } },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), result);
  assert.deepEqual(captured, {
    sessionId: "session-1",
    query: "alpha",
    mode: "compact",
    offset: 256,
    blockIndex: 1,
    limit: 12,
  });
});

test("conversation search page route caps page size at 100", async () => {
  let capturedLimit: number | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        searchConversationPage: async (_sessionId, query, mode, anchor, limit) => {
          capturedLimit = limit;
          return {
            query,
            mode,
            totalHits: 140,
            hits: [],
            nextAnchor: anchor,
          };
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages/search-page?q=alpha&mode=compact&limit=200",
    { headers: { cookie } },
  );

  assert.equal(response.status, 200);
  assert.equal(capturedLimit, 100);
});

test("conversation locate route delegates to provider adapter and returns 404 when miss", async () => {
  let captured:
    | { messageId: string; mode: string; sessionId: string; window: number }
    | null = null;
  const located: ConversationLocateResult = {
    hitMessageId: "message-2",
    messages: [{
      id: "message-2",
      role: "assistant",
      kind: "text",
      text: "beta 命中",
    }],
    hasOlder: true,
    hasNewer: false,
  };
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        locateConversation: async (sessionId, messageId, mode, window) => {
          captured = { sessionId, messageId, mode, window };
          return messageId === "message-2" ? located : null;
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages/locate?messageId=message-2&mode=compact&window=24",
    { headers: { cookie } },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), located);
  assert.deepEqual(captured, {
    sessionId: "session-1",
    messageId: "message-2",
    mode: "compact",
    window: 24,
  });

  const missing = await app.request(
    "/api/providers/codex/sessions/session-1/messages/locate?messageId=missing&mode=compact",
    { headers: { cookie } },
  );
  assert.equal(missing.status, 404);
});

test("conversation context route delegates anchor to provider adapter and returns 404 when miss", async () => {
  let captured:
    | { blockIndex: number; mode: string; offset: number; sessionId: string; window: number }
    | null = null;
  const context: ConversationContextResult = {
    anchor: { offset: 256, blockIndex: 1 },
    hitMessageId: "message-3",
    messages: [{
      id: "message-3",
      role: "assistant",
      kind: "text",
      text: "context 命中",
      anchor: { offset: 256, blockIndex: 1 },
    }],
    hasOlder: true,
    hasNewer: true,
  };
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry({
        readConversationContext: async (sessionId, anchor, mode, window) => {
          captured = {
            sessionId,
            offset: anchor.offset,
            blockIndex: anchor.blockIndex,
            mode,
            window,
          };
          return anchor.offset === 256 ? context : null;
        },
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages/context?offset=256&blockIndex=1&mode=compact&window=10",
    { headers: { cookie } },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), context);
  assert.deepEqual(captured, {
    sessionId: "session-1",
    offset: 256,
    blockIndex: 1,
    mode: "compact",
    window: 10,
  });

  const missing = await app.request(
    "/api/providers/codex/sessions/session-1/messages/context?offset=999&blockIndex=0&mode=compact",
    { headers: { cookie } },
  );
  assert.equal(missing.status, 404);
});

test("conversation search and locate routes reject unsupported capability", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createRegistry(),
    },
  );

  const cookie = await login(app);
  const searchResponse = await app.request(
    "/api/providers/codex/sessions/session-1/messages/search?q=alpha",
    { headers: { cookie } },
  );
  assert.equal(searchResponse.status, 400);

  const searchPageResponse = await app.request(
    "/api/providers/codex/sessions/session-1/messages/search-page?q=alpha",
    { headers: { cookie } },
  );
  assert.equal(searchPageResponse.status, 400);

  const locateResponse = await app.request(
    "/api/providers/codex/sessions/session-1/messages/locate?messageId=message-1",
    { headers: { cookie } },
  );
  assert.equal(locateResponse.status, 400);

  const contextResponse = await app.request(
    "/api/providers/codex/sessions/session-1/messages/context?offset=1&blockIndex=0",
    { headers: { cookie } },
  );
  assert.equal(contextResponse.status, 400);
});
