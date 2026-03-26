import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import type { AsrProvider, AsrProviderEvent } from "../api/asr/types";
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
    threadState: false,
    interrupt: false,
    userInput: false,
  },
  status: {
    historyReadable: true,
    sendAvailable: true,
    configResolved: true,
    lastError: null,
  },
};

function createProviderRegistry() {
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
    createSession: async () => ({ sessionId: "unused", turnId: null }),
    sendMessage: async () => ({ turnId: null, outputText: null }),
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
    },
  };
}

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

function createAsrProvider() {
  let emit: ((event: AsrProviderEvent) => void) | null = null;
  const audioChunks: Buffer[] = [];
  let finished = 0;
  let lastInput:
    | { sampleRate: number; channels: number; encoding: string }
    | null = null;

  const provider: AsrProvider = {
    summary: {
      id: "fake",
      label: "Fake ASR",
      description: "route test",
      inputCapabilities: {
        supportedEncodings: ["opus"],
        supportedSampleRates: [8_000, 16_000],
        supportedChannels: [1, 2],
      },
    } as never,
    startSession: async (input, onEvent) => {
      lastInput = input;
      emit = onEvent;
      onEvent({ type: "session_started" });
      return {
        appendAudio: async (chunk) => {
          audioChunks.push(Buffer.from(chunk));
          onEvent({
            type: "interim_result",
            text: `bytes:${chunk.byteLength}`,
          });
        },
        finish: async () => {
          finished += 1;
          onEvent({ type: "final_result", text: "ok" });
          onEvent({ type: "session_finished" });
        },
        cancel: async () => {
          onEvent({ type: "session_cancelled" });
        },
      };
    },
  };

  return {
    provider,
    audioChunks,
    get finished() {
      return finished;
    },
    get lastInput() {
      return lastInput;
    },
    emit(event: AsrProviderEvent) {
      if (!emit) {
        throw new Error("provider session not started");
      }
      emit(event);
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
    async expectClosed(timeoutMs = 200) {
      const result = await Promise.race([
        reader.read().then((chunk) => {
          if (chunk.done) {
            return "done";
          }
          buffer += decoder.decode(chunk.value, { stream: true });
          return buffer;
        }),
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("timeout"), timeoutMs);
        }),
      ]);
      if (result !== "done") {
        controller.abort();
        await reader.cancel();
      }
      assert.equal(result, "done");
    },
  };
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

test("asr providers route lists registered providers", async () => {
  const fake = createAsrProvider();
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createProviderRegistry(),
      asrRegistry: { fake: fake.provider },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/asr/providers", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    providers: [
      {
        id: "fake",
        label: "Fake ASR",
        description: "route test",
        inputCapabilities: {
          supportedEncodings: ["opus"],
          supportedSampleRates: [8_000, 16_000],
          supportedChannels: [1, 2],
        },
      },
    ],
  });
});

test("asr session routes create stream audio and finish against provider handle", async () => {
  const fake = createAsrProvider();
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createProviderRegistry(),
      asrRegistry: { fake: fake.provider },
    },
  );

  const cookie = await login(app);
  const created = await app.request("/api/asr/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({ providerId: "fake" }),
  });

  assert.equal(created.status, 200);
  const session = (await created.json()) as {
    sessionId: string;
    status: string;
  };
  assert.equal(session.status, "running");

  const controller = new AbortController();
  const eventsResponse = await app.request(
    `/api/asr/sessions/${session.sessionId}/events`,
    {
      headers: { cookie },
      signal: controller.signal,
    },
  );
  assert.equal(eventsResponse.status, 200);
  const sse = createSseReader(eventsResponse, controller);

  const started = await sse.readJsonEvent<{ type: string }>("asr");
  assert.equal(started.type, "session_started");

  const audioResponse = await app.request(
    `/api/asr/sessions/${session.sessionId}/audio`,
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/octet-stream",
      },
      body: Buffer.from([1, 2, 3]),
    },
  );
  assert.equal(audioResponse.status, 200);
  assert.deepEqual(fake.audioChunks, [Buffer.from([1, 2, 3])]);

  const interim = await sse.readJsonEvent<{ type: string; text: string }>("asr");
  assert.equal(interim.type, "interim_result");
  assert.equal(interim.text, "bytes:3");

  const finishResponse = await app.request(
    `/api/asr/sessions/${session.sessionId}/finish`,
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
      },
    },
  );
  assert.equal(finishResponse.status, 200);
  assert.equal(fake.finished, 1);

  const finalResult = await sse.readJsonEvent<{ type: string; text: string }>("asr");
  assert.equal(finalResult.type, "final_result");
  assert.equal(finalResult.text, "ok");

  const finished = await sse.readJsonEvent<{ type: string }>("asr");
  assert.equal(finished.type, "session_finished");

  await sse.expectClosed();
  await sse.close();
});

test("asr create session accepts provider-specific encodings without shared route hardcoding", async () => {
  const fake = createAsrProvider();
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createProviderRegistry(),
      asrRegistry: { fake: fake.provider },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/asr/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      providerId: "fake",
      sampleRate: 8_000,
      channels: 2,
      encoding: "opus",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(fake.lastInput, {
    sampleRate: 8_000,
    channels: 2,
    encoding: "opus",
  });
});

test("asr create session returns explicit provider error when registry is empty", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createProviderRegistry(),
      asrRegistry: {},
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/asr/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({ providerId: "fake" }),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "ASR_PROVIDER_NOT_FOUND",
      message: "ASR provider not found",
    },
  });
});
