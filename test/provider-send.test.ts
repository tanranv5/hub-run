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

function createSendRegistry(sendMessage: ProviderAdapter["sendMessage"]) {
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
    sendMessage,
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

test("send route requires text", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createSendRegistry(async () => ({
        turnId: null,
        outputText: null,
      })),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "" }),
    },
  );

  assert.equal(response.status, 400);
});

test("send route delegates to provider adapter", async () => {
  let captured:
    | {
        images: Array<{ name?: string; url: string }> | undefined;
        sessionId: string;
        text: string;
        model: string | null | undefined;
        effort: string | null | undefined;
      }
    | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createSendRegistry(async (sessionId, input) => {
        captured = {
          images: input.images,
          sessionId,
          text: input.text,
          model: input.model,
          effort: input.effort,
        };
        return {
          turnId: "turn-1",
          outputText: "done",
        };
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: "继续排查",
        model: "gpt-5-codex",
        effort: "high",
      }),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    ok: true,
    turnId: "turn-1",
    outputText: "done",
  });
  assert.deepEqual(captured, {
    images: undefined,
    sessionId: "session-1",
    text: "继续排查",
    model: "gpt-5-codex",
    effort: "high",
  });
});

test("send route accepts image-only payload and delegates image urls to provider adapter", async () => {
  let captured:
    | {
        images: Array<{ name?: string; url: string }> | undefined;
        sessionId: string;
        text: string;
      }
    | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createSendRegistry(async (sessionId, input) => {
        captured = {
          images: input.images,
          sessionId,
          text: input.text,
        };
        return {
          turnId: "turn-image",
          outputText: null,
        };
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: "",
        images: [{
          name: "error.png",
          url: "data:image/png;base64,AAAA",
        }],
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(captured, {
    images: [{
      name: "error.png",
      url: "data:image/png;base64,AAAA",
    }],
    sessionId: "session-1",
    text: "",
  });
});

test("send route returns 404 when the session no longer exists", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: createSendRegistry(async () => {
        throw new Error("thread not found: missing");
      }),
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/missing/messages",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "继续排查" }),
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "SESSION_NOT_FOUND",
      message: "thread not found: missing",
    },
  });
});

test("send route rejects providers without send capability before calling the adapter", async () => {
  let called = false;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => {
          called = true;
          return {
            turnId: null,
            outputText: null,
          };
        }),
        codex: {
          ...createSendRegistry(async () => {
            called = true;
            return {
              turnId: null,
              outputText: null,
            };
          }).codex,
          summary: {
            ...PROVIDER_SUMMARY,
            capabilities: {
              ...PROVIDER_SUMMARY.capabilities,
              send: false,
            },
            status: {
              ...PROVIDER_SUMMARY.status,
              sendAvailable: false,
            },
          },
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request(
    "/api/providers/codex/sessions/session-1/messages",
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ text: "不能发送" }),
    },
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.match(await response.text(), /does not support send/i);
});

test("models route delegates to provider adapter", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => ({
          turnId: null,
          outputText: null,
        })),
        codex: {
          ...createSendRegistry(async () => ({
            turnId: null,
            outputText: null,
          })).codex,
          listModels: async () => [
            {
              id: "gpt-5-codex",
              displayName: "GPT-5 Codex",
              description: "default model",
              isDefault: true,
              hidden: false,
              defaultReasoningEffort: "medium",
              supportedReasoningEfforts: ["low", "medium", "high"],
            },
          ],
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/models", {
    headers: { cookie },
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.models, [
    {
      id: "gpt-5-codex",
      displayName: "GPT-5 Codex",
      description: "default model",
      isDefault: true,
      hidden: false,
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: ["low", "medium", "high"],
    },
  ]);
});

test("create session route delegates to provider adapter", async () => {
  let captured:
    | {
        cwd: string;
        images: Array<{ name?: string; url: string }> | undefined;
        text: string | null | undefined;
        model: string | null | undefined;
        effort: string | null | undefined;
      }
    | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => ({
          turnId: null,
          outputText: null,
        })),
        codex: {
          ...createSendRegistry(async () => ({
            turnId: null,
            outputText: null,
          })).codex,
          createSession: async (input) => {
            const createInput = input as typeof input & {
              text?: string | null;
            };
            captured = {
              cwd: input.cwd,
              images: input.images,
              text: createInput.text,
              model: input.model,
              effort: input.effort,
            };
            return {
              sessionId: "session-created",
              turnId: null,
            };
          },
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/Users/tanran/aiCode/cw/hub-run",
      text: "首条消息",
      model: "gpt-5-codex",
      effort: "high",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    ok: true,
    sessionId: "session-created",
    turnId: null,
  });
  assert.deepEqual(captured, {
    cwd: "/Users/tanran/aiCode/cw/hub-run",
    images: undefined,
    text: "首条消息",
    model: "gpt-5-codex",
    effort: "high",
  });
});

test("create session route accepts image-only payload and delegates images to provider adapter", async () => {
  let captured:
    | {
        cwd: string;
        images: Array<{ name?: string; url: string }> | undefined;
        text: string | null | undefined;
      }
    | null = null;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => ({
          turnId: null,
          outputText: null,
        })),
        codex: {
          ...createSendRegistry(async () => ({
            turnId: null,
            outputText: null,
          })).codex,
          createSession: async (input) => {
            captured = {
              cwd: input.cwd,
              images: input.images,
              text: input.text,
            };
            return {
              sessionId: "session-with-image",
              turnId: "turn-image",
            };
          },
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/Users/tanran/aiCode/cw/hub-run",
      images: [{
        name: "error.png",
        url: "data:image/png;base64,AAAA",
      }],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(captured, {
    cwd: "/Users/tanran/aiCode/cw/hub-run",
    images: [{
      name: "error.png",
      url: "data:image/png;base64,AAAA",
    }],
    text: undefined,
  });
});

test("create session route returns outputText when the provider returns an immediate reply", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => ({
          turnId: null,
          outputText: null,
        })),
        claude: {
          ...createSendRegistry(async () => ({
            turnId: null,
            outputText: null,
          })).claude,
          createSession: async () => ({
            sessionId: "claude-session-created",
            turnId: null,
            outputText: "Claude 首条回复",
          }),
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/claude/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/Users/tanran/aiCode/cw/hub-run",
      text: "首条消息",
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    sessionId: "claude-session-created",
    turnId: null,
    outputText: "Claude 首条回复",
  });
});

test("create session route requires text or images when provider does not allow empty create", async () => {
  let called = false;
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => ({
          turnId: null,
          outputText: null,
        })),
        codex: {
          ...createSendRegistry(async () => ({
            turnId: null,
            outputText: null,
          })).codex,
          createSession: async () => {
            called = true;
            return {
              sessionId: "session-created",
              turnId: null,
            };
          },
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/Users/tanran/aiCode/cw/hub-run",
    }),
  });

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.match(await response.text(), /text or images is required/i);
});

test("create session route maps provider validation errors to 400 instead of a generic 500", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => ({
          turnId: null,
          outputText: null,
        })),
        claude: {
          ...createSendRegistry(async () => ({
            turnId: null,
            outputText: null,
          })).claude,
          createSession: async () => {
            throw new Error("text is required");
          },
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/claude/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/Users/tanran/aiCode/cw/hub-run",
      text: "首条消息",
    }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "PARSE_FAILED",
      message: "text is required",
    },
  });
});

test("create session route maps provider timeout errors to 503", async () => {
  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        ...createSendRegistry(async () => ({
          turnId: null,
          outputText: null,
        })),
        claude: {
          ...createSendRegistry(async () => ({
            turnId: null,
            outputText: null,
          })).claude,
          createSession: async () => {
            throw new Error("claude create timed out");
          },
        } as ProviderAdapter,
      },
    },
  );

  const cookie = await login(app);
  const response = await app.request("/api/providers/claude/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/Users/tanran/aiCode/cw/hub-run",
      text: "首条消息",
    }),
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: "TRANSPORT_UNAVAILABLE",
      message: "claude create timed out",
    },
  });
});
