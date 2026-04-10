import assert from "node:assert/strict";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import { createCodexProvider } from "../api/providers/sources/codex";
import type { ProviderAdapter, ProviderSummary } from "../api/types";
import {
  createClaudeAdapter,
  createSummary,
} from "./provider-codex-app-server-test-helpers";
import { readCookie } from "./helpers";

const FIXTURE_CODEX_ROOT = resolve(
  "/Users/tanran/aiCode/cw/hub-run/test/fixtures/home/.codex",
);

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

function createCodexStreamApp() {
  const home = mkdtempSync(join(tmpdir(), "hub-run-stream-"));
  const codexRoot = join(home, ".codex");
  cpSync(FIXTURE_CODEX_ROOT, codexRoot, { recursive: true });

  const source = createCodexProvider(codexRoot) as ReturnType<
    typeof createCodexProvider
  > &
    Record<string, unknown>;
  const summary = {
    ...createSummary(codexRoot),
    capabilities: {
      ...createSummary(codexRoot).capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: {
          summary,
          listSessions: source.readSessions as ProviderAdapter["listSessions"],
          listProjects: source.readProjects as ProviderAdapter["listProjects"],
          listModels: source.listModels as ProviderAdapter["listModels"],
          getConversationPage: source.readConversationPage as ProviderAdapter["getConversationPage"],
          createSession: source.createSession as ProviderAdapter["createSession"],
          sendMessage: source.sendMessage as ProviderAdapter["sendMessage"],
          getThreadState: source.getThreadState as ProviderAdapter["getThreadState"],
          interruptSession: source.interruptSession as ProviderAdapter["interruptSession"],
          listUserInputRequests: source.listUserInputRequests as ProviderAdapter["listUserInputRequests"],
          submitUserInput: source.submitUserInput as ProviderAdapter["submitUserInput"],
          subscribeSessions: source.subscribeSessions as ProviderAdapter["subscribeSessions"],
          subscribeConversation: source.subscribeConversation as ProviderAdapter["subscribeConversation"],
          getConversationStream: source.getConversationStream as ProviderAdapter["getConversationStream"],
          getConversationStreamCursor: source.getConversationStreamCursor as ProviderAdapter["getConversationStreamCursor"],
        } as unknown as ProviderAdapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  return {
    app,
    codexRoot,
    async cleanup() {
      await rm(home, { recursive: true, force: true });
    },
  };
}

function createSseReader(response: Response, controller: AbortController) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("missing SSE reader");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  return {
    async readJsonEvent<T>(eventName: string): Promise<T> {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const parsed = takeEvent(buffer, eventName);
        if (parsed.match) {
          buffer = parsed.rest;
          return JSON.parse(parsed.match.data) as T;
        }

        const chunk = await reader.read();
        if (chunk.done) {
          throw new Error(`SSE closed before event ${eventName}`);
        }
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      throw new Error(`Timed out waiting for SSE event ${eventName}`);
    },
    async close() {
      controller.abort();
      await reader.cancel();
    },
    async readOptionalJsonEvent<T>(
      eventName: string,
      timeoutMs: number,
    ): Promise<T | null> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const parsed = takeEvent(buffer, eventName);
        if (parsed.match) {
          buffer = parsed.rest;
          return JSON.parse(parsed.match.data) as T;
        }

        const remaining = deadline - Date.now();
        const chunk = await Promise.race([
          reader.read(),
          new Promise<"timeout">((resolve) => {
            setTimeout(() => resolve("timeout"), remaining);
          }),
        ]);
        if (chunk === "timeout") {
          return null;
        }
        if (chunk.done) {
          return null;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      return null;
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function captureUnhandledRejection(
  action: () => void,
  timeoutMs: number,
): Promise<unknown | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value: unknown | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      process.off("unhandledRejection", onUnhandledRejection);
      resolve(value);
    };

    const onUnhandledRejection = (reason: unknown) => {
      finish(reason);
    };

    const timer = setTimeout(() => {
      finish(null);
    }, timeoutMs);

    process.on("unhandledRejection", onUnhandledRejection);
    action();
  });
}

function takeEvent(
  buffer: string,
  expectedEvent: string,
): { match: { event: string; data: string } | null; rest: string } {
  const boundary = buffer.indexOf("\n\n");
  if (boundary < 0) {
    return { match: null, rest: buffer };
  }

  const rawEvent = buffer.slice(0, boundary);
  const rest = buffer.slice(boundary + 2);
  const lines = rawEvent.split("\n");
  const event = lines
    .find((line) => line.startsWith("event: "))
    ?.slice("event: ".length) ?? "";
  const data = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n");
  if (event === expectedEvent) {
    return { match: { event, data }, rest };
  }
  return takeEvent(rest, expectedEvent);
}

test("provider sessions stream requires auth", async (t) => {
  const setup = createCodexStreamApp();
  t.after(async () => {
    await setup.cleanup();
  });

  const response = await setup.app.request(
    "/api/providers/codex/sessions/stream?loaded=2",
  );

  assert.equal(response.status, 401);
});

test("codex runtime state stream emits snapshot and later status updates", async () => {
  const summary = {
    ...createSummary("/tmp/runtime-stream-codex"),
    capabilities: {
      ...createSummary("/tmp/runtime-stream-codex").capabilities,
      threadState: true,
      userInput: true,
    },
  } as ProviderSummary;
  let currentThreadState = {
    threadId: "session-1",
    activeTurnId: "turn-1",
    isGenerating: true,
    requestedTurnId: "turn-1",
    requestedTurnStatus: "inProgress" as const,
  };
  let currentRequests = [
    {
      requestId: "req-1",
      threadId: "session-1",
      turnId: "turn-1",
      itemId: "item-1",
      questions: [],
    },
  ];

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: {
          summary,
          listSessions: async () => [],
          listProjects: async () => [],
          listModels: async () => [],
          getConversationPage: async () => ({
            messages: [],
            nextBefore: null,
            summary: null,
          }),
          createSession: async () => ({
            sessionId: "session-1",
            turnId: null,
          }),
          sendMessage: async () => ({
            turnId: null,
            outputText: null,
          }),
          getThreadState: async () => currentThreadState,
          listUserInputRequests: async () => currentRequests,
        } as unknown as ProviderAdapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/state/stream",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const sse = createSseReader(response, controller);

  const snapshot = await sse.readJsonEvent<{
    threadState: typeof currentThreadState;
    pendingUserInputRequests: typeof currentRequests;
  }>("runtimeState");
  assert.deepEqual(snapshot.threadState, currentThreadState);
  assert.deepEqual(snapshot.pendingUserInputRequests, currentRequests);

  currentThreadState = {
    threadId: "session-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-1",
    requestedTurnStatus: "interrupted",
  };
  currentRequests = [];

  const update = await sse.readJsonEvent<{
    threadState: typeof currentThreadState;
    pendingUserInputRequests: typeof currentRequests;
  }>("runtimeState");
  assert.deepEqual(update.threadState, currentThreadState);
  assert.deepEqual(update.pendingUserInputRequests, []);

  await sse.close();
});

test("codex runtime state stream downgrades stale terminal snapshots when the latest message tail is newer", async () => {
  const summary = {
    ...createSummary("/tmp/runtime-stream-codex"),
    capabilities: {
      ...createSummary("/tmp/runtime-stream-codex").capabilities,
      threadState: true,
      userInput: true,
    },
  } as ProviderSummary;

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: {
          summary,
          listSessions: async () => [],
          listProjects: async () => [],
          listModels: async () => [],
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
          createSession: async () => ({
            sessionId: "session-1",
            turnId: null,
          }),
          sendMessage: async () => ({
            turnId: null,
            outputText: null,
          }),
          getThreadState: async () => ({
            threadId: "session-1",
            activeTurnId: null,
            isGenerating: false,
            requestedTurnId: "turn-1",
            requestedTurnStatus: "interrupted" as const,
            snapshotAt: "2026-03-27T07:29:58.000Z",
          }),
          listUserInputRequests: async () => [],
        } as unknown as ProviderAdapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/state/stream",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  const snapshot = await sse.readJsonEvent<{
    threadState: Record<string, unknown>;
    pendingUserInputRequests: [];
  }>("runtimeState");

  assert.deepEqual(snapshot, {
    threadState: {
      threadId: "session-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-1",
      requestedTurnStatus: null,
      rawRequestedTurnStatus: "interrupted",
      desynced: true,
      desyncReason: "messageTailAheadOfThreadSnapshot",
      snapshotAt: "2026-03-27T07:29:58.000Z",
      latestMessageAt: "2026-03-27T07:40:04.631Z",
    },
    pendingUserInputRequests: [],
  });

  await sse.close();
});

test("codex runtime state stream marks stalled turns after prolonged inactivity", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: {
          summary: createSummary("/tmp/codex"),
          listSessions: async () => [],
          listProjects: async () => [],
          listModels: async () => [],
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
          createSession: async () => ({
            sessionId: "session-1",
            turnId: null,
          }),
          sendMessage: async () => ({
            turnId: null,
            outputText: null,
          }),
          getThreadState: async () => ({
            threadId: "session-1",
            activeTurnId: null,
            isGenerating: false,
            requestedTurnId: "turn-2",
            requestedTurnStatus: null as const,
            snapshotAt: "2026-03-27T07:29:58.000Z",
          }),
          listUserInputRequests: async () => [],
        } as unknown as ProviderAdapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/state/stream",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  const snapshot = await sse.readJsonEvent<{
    threadState: Record<string, unknown>;
    pendingUserInputRequests: [];
  }>("runtimeState");

  assert.deepEqual(snapshot, {
    threadState: {
      threadId: "session-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-2",
      requestedTurnStatus: null,
      stalled: true,
      stallReason: "noRecentActivity",
      snapshotAt: "2026-03-27T07:29:58.000Z",
      latestMessageAt: "2026-03-27T07:40:04.631Z",
      lastActivityAt: "2026-03-27T07:40:04.631Z",
    },
    pendingUserInputRequests: [],
  });

  await sse.close();
});

test("codex sessions stream emits snapshot and loaded-window diff updates", async (t) => {
  const setup = createCodexStreamApp();
  t.after(async () => {
    await setup.cleanup();
  });

  const cookie = await login(setup.app);
  const controller = new AbortController();
  const response = await setup.app.request(
    "/api/providers/codex/sessions/stream?loaded=2",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

  const sse = createSseReader(response, controller);
  const snapshot = await sse.readJsonEvent<{
    sessions: Array<{ id: string }>;
    nextBefore: string | null;
    totalCount: number;
  }>("sessions");

  assert.deepEqual(
    snapshot.sessions.map((session) => session.id),
    ["codex-session-3", "codex-session-2"],
  );
  assert.equal(snapshot.nextBefore, "2");
  assert.equal(snapshot.totalCount, 3);

  const sessionFile = join(
    setup.codexRoot,
    "sessions",
    "2026",
    "01",
    "19",
    "rollout-2026-01-19T11-00-00-codex-session-4.jsonl",
  );
  mkdirSync(join(setup.codexRoot, "sessions", "2026", "01", "19"), {
    recursive: true,
  });
  writeFileSync(
    sessionFile,
    [
      "{\"timestamp\":\"2026-01-19T11:00:00.000Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"codex-session-4\",\"timestamp\":\"2026-01-19T11:00:00.000Z\",\"cwd\":\"/workspace/new-top\"}}",
      "{\"timestamp\":\"2026-01-19T11:00:01.000Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"user\",\"content\":[{\"type\":\"input_text\",\"text\":\"新增巡检任务\"}]}}",
    ].join("\n"),
  );
  appendFileSync(
    join(setup.codexRoot, "history.jsonl"),
    "\n{\"session_id\":\"codex-session-4\",\"ts\":1768788000,\"text\":\"新增巡检任务\"}",
  );

  const update = await sse.readJsonEvent<{
    upserts: Array<{ id: string }>;
    removedIds: string[];
    nextBefore: string | null;
    totalCount: number;
  }>("sessionsUpdate");

  assert.deepEqual(
    update.upserts.map((session) => session.id),
    ["codex-session-4"],
  );
  assert.deepEqual(update.removedIds, ["codex-session-2"]);
  assert.equal(update.nextBefore, "2");
  assert.equal(update.totalCount, 4);

  await sse.close();
});

test("sessions stream does not miss an update that lands while the initial snapshot is loading", async () => {
  const summary = {
    ...createSummary("/tmp/session-race-codex"),
    capabilities: {
      ...createSummary("/tmp/session-race-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  let currentSessions = [
    {
      id: "session-old",
      display: "Old Session",
      timestamp: 1_700_000_000_000,
      project: "/tmp/session-race",
      projectName: "session-race",
    },
  ];
  let onSessionsChange: (() => void) | null = null;
  let resolveFirstRead: (() => void) | null = null;
  const firstReadStarted = new Promise<void>((resolve) => {
    resolveFirstRead = resolve;
  });
  let firstRead = true;

  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => {
      const snapshot = [...currentSessions];
      if (firstRead) {
        firstRead = false;
        await firstReadStarted;
      }
      return snapshot;
    },
    listProjects: async () => ["/tmp/session-race"],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "session-old",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeSessions: (onChange) => {
      onSessionsChange = onChange;
      return () => {
        onSessionsChange = null;
      };
    },
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const responsePromise = app.request(
    "/api/providers/codex/sessions/stream?loaded=2",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  await Promise.resolve();
  currentSessions = [
    {
      id: "session-new",
      display: "New Session",
      timestamp: 1_700_000_000_100,
      project: "/tmp/session-race",
      projectName: "session-race",
    },
  ];
  onSessionsChange?.();
  resolveFirstRead?.();

  const response = await responsePromise;
  assert.equal(response.status, 200);

  const sse = createSseReader(response, controller);
  const snapshot = await sse.readJsonEvent<{
    sessions: Array<{ id: string }>;
  }>("sessions");

  assert.deepEqual(snapshot.sessions.map((session) => session.id), ["session-old"]);

  const update = await sse.readJsonEvent<{
    upserts: Array<{ id: string }>;
    removedIds: string[];
  }>("sessionsUpdate");

  assert.deepEqual(update.upserts.map((session) => session.id), ["session-new"]);
  assert.deepEqual(update.removedIds, ["session-old"]);

  await sse.close();
});

test("sessions stream serializes concurrent updates instead of emitting a stale rollback", async () => {
  let onSessionsChange: (() => void) | null = null;
  const firstUpdateGate = createDeferred<void>();
  const summary = {
    ...createSummary("/tmp/sessions-race-codex"),
    capabilities: {
      ...createSummary("/tmp/sessions-race-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const sessionOld = {
    id: "session-old",
    display: "Old Session",
    timestamp: 1_700_000_000_000,
    project: "/tmp/sessions-race",
    projectName: "sessions-race",
  };
  const sessionMid = {
    id: "session-mid",
    display: "Mid Session",
    timestamp: 1_700_000_000_100,
    project: "/tmp/sessions-race",
    projectName: "sessions-race",
  };
  const sessionNew = {
    id: "session-new",
    display: "New Session",
    timestamp: 1_700_000_000_200,
    project: "/tmp/sessions-race",
    projectName: "sessions-race",
  };

  let currentSessions = [sessionOld];
  let listSessionsCallCount = 0;
  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => {
      const snapshot = [...currentSessions];
      listSessionsCallCount += 1;
      if (listSessionsCallCount === 2) {
        await firstUpdateGate.promise;
      }
      return snapshot;
    },
    listProjects: async () => ["/tmp/sessions-race"],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: sessionOld.id,
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeSessions: (onChange) => {
      onSessionsChange = onChange;
      return () => {
        onSessionsChange = null;
      };
    },
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request("/api/providers/codex/sessions/stream?loaded=2", {
    headers: { cookie },
    signal: controller.signal,
  });

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  const snapshot = await sse.readJsonEvent<{
    sessions: Array<{ id: string }>;
  }>("sessions");
  assert.deepEqual(snapshot.sessions.map((session) => session.id), [sessionOld.id]);
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

  currentSessions = [sessionMid];
  onSessionsChange?.();
  await Promise.resolve();
  currentSessions = [sessionNew];
  onSessionsChange?.();
  await new Promise((resolve) => {
    setTimeout(resolve, 120);
  });

  firstUpdateGate.resolve();
  const firstUpdate = await sse.readJsonEvent<{
    upserts: Array<{ id: string }>;
    removedIds: string[];
  }>("sessionsUpdate");
  assert.deepEqual(firstUpdate.upserts.map((session) => session.id), [sessionMid.id]);
  assert.deepEqual(firstUpdate.removedIds, [sessionOld.id]);

  const secondUpdate = await sse.readJsonEvent<{
    upserts: Array<{ id: string }>;
    removedIds: string[];
  }>("sessionsUpdate");
  assert.deepEqual(secondUpdate.upserts.map((session) => session.id), [sessionNew.id]);
  assert.deepEqual(secondUpdate.removedIds, [sessionMid.id]);

  await sse.close();
});

test("sessions stream catches async pump failures instead of leaking unhandled rejections", async () => {
  let onSessionsChange: (() => void) | null = null;
  let shouldThrow = false;
  const summary = {
    ...createSummary("/tmp/session-failure-codex"),
    capabilities: {
      ...createSummary("/tmp/session-failure-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => {
      if (shouldThrow) {
        throw new Error("sessions update exploded");
      }
      return [
        {
          id: "session-1",
          display: "Session 1",
          timestamp: 1_700_000_000_000,
          project: "/tmp/session-failure",
          projectName: "session-failure",
        },
      ];
    },
    listProjects: async () => ["/tmp/session-failure"],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "session-1",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeSessions: (onChange) => {
      onSessionsChange = onChange;
      return () => {
        onSessionsChange = null;
      };
    },
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request("/api/providers/codex/sessions/stream?loaded=2", {
    headers: { cookie },
    signal: controller.signal,
  });

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  await sse.readJsonEvent("sessions");
  shouldThrow = true;
  const errors: unknown[][] = [];
  const previousConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const unhandled = await captureUnhandledRejection(() => {
      onSessionsChange?.();
    }, 200);

    assert.equal(unhandled, null);
    assert.equal(errors.length, 1);
  } finally {
    console.error = previousConsoleError;
  }

  await sse.close();
});

test("codex conversation stream emits recent snapshot and byte-offset deltas", async (t) => {
  const setup = createCodexStreamApp();
  t.after(async () => {
    await setup.cleanup();
  });

  const cookie = await login(setup.app);
  const controller = new AbortController();
  const response = await setup.app.request(
    "/api/providers/codex/sessions/codex-session-1/messages/stream?limit=2",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  if (response.status !== 200) {
    assert.fail(`unexpected status ${response.status}: ${await response.text()}`);
  }
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);

  const sse = createSseReader(response, controller);
  const snapshot = await sse.readJsonEvent<{
    messages: Array<{ kind: string }>;
    nextBefore: string | null;
    nextOffset: number;
  }>("conversation");

  assert.deepEqual(
    snapshot.messages.map((message) => message.kind),
    ["tool_use", "tool_result"],
  );
  assert.equal(snapshot.nextBefore, "3");
  assert.equal(Number.isInteger(snapshot.nextOffset), true);

  appendFileSync(
    join(
      setup.codexRoot,
      "sessions",
      "2026",
      "01",
      "19",
      "rollout-2026-01-19T08-00-00-codex-session-1.jsonl",
    ),
    "\n{\"timestamp\":\"2026-01-19T08:00:06.000Z\",\"type\":\"response_item\",\"payload\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"新的增量回复\"}]}}",
  );

  const delta = await sse.readJsonEvent<{
    messages: Array<{ text: string }>;
    nextOffset: number;
  }>("messages");

  assert.deepEqual(
    delta.messages.map((message) => message.text),
    ["新的增量回复"],
  );
  assert.equal(delta.nextOffset > snapshot.nextOffset, true);

  await sse.close();
});

test("conversation stream forwards mode to both snapshot and delta readers", async () => {
  let onConversationChange: (() => void) | null = null;
  let snapshotMode: string | undefined;
  let deltaMode: string | undefined;
  const summary = {
    ...createSummary("/tmp/mode-stream-codex"),
    capabilities: {
      ...createSummary("/tmp/mode-stream-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => [],
    listProjects: async () => [],
    listModels: async () => [],
    getConversationPage: async (_sessionId, _before, _limit, mode) => {
      snapshotMode = mode;
      return {
        messages: [
          {
            id: "snapshot-1",
            role: "assistant",
            kind: "text",
            text: `snapshot:${mode ?? "missing"}`,
          },
        ],
        nextBefore: null,
        summary: null,
      };
    },
    createSession: async () => ({
      sessionId: "mode-session",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeConversation: (_sessionId, onChange) => {
      onConversationChange = onChange;
      return () => {
        onConversationChange = null;
      };
    },
    getConversationStream: async (_sessionId, _offset, mode) => {
      deltaMode = mode;
      return {
        messages: [
          {
            id: "delta-1",
            role: "assistant",
            kind: "text",
            text: `delta:${mode ?? "missing"}`,
          },
        ],
        nextOffset: 1,
      };
    },
    getConversationStreamCursor: async () => 0,
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/mode-session/messages/stream?limit=2&mode=compact",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  const snapshot = await sse.readJsonEvent<{
    messages: Array<{ text: string }>;
  }>("conversation");
  assert.equal(snapshotMode, "compact");
  assert.deepEqual(snapshot.messages.map((message) => message.text), ["snapshot:compact"]);

  onConversationChange?.();

  const delta = await sse.readJsonEvent<{
    messages: Array<{ text: string }>;
  }>("messages");
  assert.equal(deltaMode, "compact");
  assert.deepEqual(delta.messages.map((message) => message.text), ["delta:compact"]);

  await sse.close();
});

test("conversation stream rejects invalid mode", async () => {
  const setup = createCodexStreamApp();
  try {
    const cookie = await login(setup.app);
    const response = await setup.app.request(
      "/api/providers/codex/sessions/codex-session-1/messages/stream?limit=2&mode=weird",
      {
        headers: { cookie },
      },
    );

    assert.equal(response.status, 400);
  } finally {
    await setup.cleanup();
  }
});

test("conversation stream coalesces concurrent change notifications into one delta", async () => {
  let onConversationChange: (() => void) | null = null;
  const summary = {
    ...createSummary("/tmp/race-codex"),
    capabilities: {
      ...createSummary("/tmp/race-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => [
      {
        id: "race-session",
        display: "Race Session",
        timestamp: 1_700_000_000_000,
        project: "/tmp/race-project",
        projectName: "race-project",
      },
    ],
    listProjects: async () => ["/tmp/race-project"],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "race-session",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeConversation: (_sessionId, onChange) => {
      onConversationChange = onChange;
      return () => {
        onConversationChange = null;
      };
    },
    getConversationStream: async (_sessionId, offset) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 40);
      });
      if (offset > 0) {
        return {
          messages: [],
          nextOffset: 1,
        };
      }
      return {
        messages: [
          {
            id: "delta-1",
            role: "assistant",
            kind: "text",
            text: "dup",
          },
        ],
        nextOffset: 1,
      };
    },
    getConversationStreamCursor: async () => 0,
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/race-session/messages/stream?limit=2",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  await sse.readJsonEvent("conversation");

  onConversationChange?.();
  onConversationChange?.();

  const firstDelta = await sse.readJsonEvent<{
    messages: Array<{ text: string }>;
  }>("messages");
  assert.deepEqual(firstDelta.messages.map((message) => message.text), ["dup"]);

  const duplicateDelta = await sse.readOptionalJsonEvent("messages", 150);
  assert.equal(duplicateDelta, null);

  await sse.close();
});

test("conversation stream survives synchronous subscription updates on offset replay", async () => {
  const summary = {
    ...createSummary("/tmp/sync-codex"),
    capabilities: {
      ...createSummary("/tmp/sync-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => [
      {
        id: "sync-session",
        display: "Sync Session",
        timestamp: 1_700_000_000_000,
        project: "/tmp/sync-project",
        projectName: "sync-project",
      },
    ],
    listProjects: async () => ["/tmp/sync-project"],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "sync-session",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeConversation: (_sessionId, onChange) => {
      onChange();
      return () => undefined;
    },
    getConversationStream: async (_sessionId, offset) => {
      if (offset > 1) {
        return {
          messages: [],
          nextOffset: offset,
        };
      }
      return {
        messages: [
          {
            id: "sync-delta-1",
            role: "assistant",
            kind: "text",
            text: "sync update",
          },
        ],
        nextOffset: 2,
      };
    },
    getConversationStreamCursor: async () => 2,
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/sync-session/messages/stream?limit=2&offset=1",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  const delta = await sse.readJsonEvent<{
    messages: Array<{ text: string }>;
    nextOffset: number;
  }>("messages");

  assert.deepEqual(delta.messages.map((message) => message.text), ["sync update"]);
  assert.equal(delta.nextOffset, 2);

  const duplicateDelta = await sse.readOptionalJsonEvent("messages", 150);
  assert.equal(duplicateDelta, null);

  await sse.close();
});

test("conversation stream periodically catches up even when no file-change notification fires", async () => {
  let deltaReadCount = 0;
  const summary = {
    ...createSummary("/tmp/catchup-codex"),
    capabilities: {
      ...createSummary("/tmp/catchup-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => [
      {
        id: "catchup-session",
        display: "Catchup Session",
        timestamp: 1_700_000_000_000,
        project: "/tmp/catchup-project",
        projectName: "catchup-project",
      },
    ],
    listProjects: async () => ["/tmp/catchup-project"],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [
        {
          id: "snapshot-1",
          role: "assistant",
          kind: "text",
          text: "snapshot",
        },
      ],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "catchup-session",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeConversation: () => () => undefined,
    getConversationStream: async (_sessionId, offset) => {
      deltaReadCount += 1;
      if (offset === 1 && deltaReadCount === 1) {
        return {
          messages: [
            {
              id: "delta-1",
              role: "assistant",
              kind: "text",
              text: "catch-up delta",
            },
          ],
          nextOffset: 2,
        };
      }
      return {
        messages: [],
        nextOffset: offset,
      };
    },
    getConversationStreamCursor: async () => 1,
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/catchup-session/messages/stream?limit=2",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  await sse.readJsonEvent("conversation");

  const delta = await sse.readJsonEvent<{
    messages: Array<{ text: string }>;
    nextOffset: number;
  }>("messages");

  assert.deepEqual(delta.messages.map((message) => message.text), ["catch-up delta"]);
  assert.equal(delta.nextOffset, 2);
  assert.equal(deltaReadCount >= 1, true);

  await sse.close();
});

test("conversation stream catches async delta pump failures instead of leaking unhandled rejections", async () => {
  let onConversationChange: (() => void) | null = null;
  const summary = {
    ...createSummary("/tmp/conversation-failure-codex"),
    capabilities: {
      ...createSummary("/tmp/conversation-failure-codex").capabilities,
      stream: true,
    },
  } as ProviderSummary;

  const adapter: ProviderAdapter = {
    summary,
    listSessions: async () => [
      {
        id: "session-1",
        display: "Session 1",
        timestamp: 1_700_000_000_000,
        project: "/tmp/conversation-failure",
        projectName: "conversation-failure",
      },
    ],
    listProjects: async () => ["/tmp/conversation-failure"],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => ({
      sessionId: "session-1",
      turnId: null,
    }),
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
    subscribeConversation: (_sessionId, onChange) => {
      onConversationChange = onChange;
      return () => {
        onConversationChange = null;
      };
    },
    getConversationStream: async () => {
      throw new Error("conversation delta exploded");
    },
    getConversationStreamCursor: async () => 0,
  };

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: adapter,
        claude: createClaudeAdapter(),
      },
    },
  );

  const cookie = await login(app);
  const controller = new AbortController();
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages/stream?limit=2",
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );

  assert.equal(response.status, 200);
  const sse = createSseReader(response, controller);
  await sse.readJsonEvent("conversation");
  const errors: unknown[][] = [];
  const previousConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };

  try {
    const unhandled = await captureUnhandledRejection(() => {
      onConversationChange?.();
    }, 200);

    assert.equal(unhandled, null);
    assert.equal(errors.length, 1);
  } finally {
    console.error = previousConsoleError;
  }

  await sse.close();
});
