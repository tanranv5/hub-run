import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import { createCodexProvider } from "../api/providers/sources/codex";
import { closeCodexAppServerClient } from "../api/providers/transports/codex-app-server";
import type { ProviderAdapter, ProviderSummary } from "../api/types";
import { readCookie } from "./helpers";

export const FAKE_CODEX_PATH = resolve(
  "/Users/tanran/aiCode/cw/hub-run/test/fixtures/fake-codex-app-server.mjs",
);

export async function login(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:12001",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  if (response.status !== 200) {
    throw new Error(`login failed: ${response.status}`);
  }
  return readCookie(response.headers.get("set-cookie"));
}

export function createSummary(rootPath: string) {
  return {
    id: "codex",
    label: "Codex",
    description: "test",
    rootPath,
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
}

export function createClaudeAdapter(): ProviderAdapter {
  return {
    summary: {
      ...createSummary("/tmp/claude"),
      id: "claude",
      label: "Claude",
    } as ProviderSummary,
    listSessions: async () => [],
    listProjects: async () => [],
    listModels: async () => [],
    getConversationPage: async () => ({
      messages: [],
      nextBefore: null,
      summary: null,
    }),
    createSession: async () => {
      throw new Error("unsupported");
    },
    sendMessage: async () => ({
      turnId: null,
      outputText: null,
    }),
  };
}

export function createCodexAdapter(rootPath: string): ProviderAdapter {
  const source = createCodexProvider(rootPath) as ReturnType<typeof createCodexProvider> &
    Record<string, unknown>;
  return {
    summary: createSummary(rootPath),
    listSessions: source.readSessions,
    listProjects: source.readProjects,
    listModels: source.listModels,
    getConversationPage: source.readConversationPage,
    createSession: source.createSession,
    sendMessage: source.sendMessage,
    getThreadState: source.getThreadState,
    interruptSession: source.interruptSession,
    listUserInputRequests: source.listUserInputRequests,
    submitUserInput: source.submitUserInput,
  } as unknown as ProviderAdapter;
}

export function createCodexHome() {
  const home = mkdtempSync(join(tmpdir(), "hub-run-codex-"));
  const codexRoot = join(home, ".codex");
  mkdirSync(join(codexRoot, "sessions"), { recursive: true });
  writeFileSync(join(codexRoot, "history.jsonl"), "");
  return { home, codexRoot };
}

export async function setupCodexAppServerTest() {
  chmodSync(FAKE_CODEX_PATH, 0o755);
  const previousPath = process.env.CODEX_CLI_PATH;
  const previousFakeStatePath = process.env.FAKE_CODEX_APP_SERVER_STATE_PATH;
  const previousStateDir = process.env.HUB_RUN_STATE_DIR;
  const { home, codexRoot } = createCodexHome();
  process.env.CODEX_CLI_PATH = FAKE_CODEX_PATH;
  process.env.FAKE_CODEX_APP_SERVER_STATE_PATH = join(
    home,
    "fake-codex-app-server-state.json",
  );
  process.env.HUB_RUN_STATE_DIR = join(home, ".hub-run-state");

  const app = createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
    {
      registry: {
        codex: createCodexAdapter(codexRoot),
        claude: createClaudeAdapter(),
      },
    },
  );

  return {
    app,
    async cleanup() {
      process.env.CODEX_CLI_PATH = previousPath;
      process.env.FAKE_CODEX_APP_SERVER_STATE_PATH = previousFakeStatePath;
      process.env.HUB_RUN_STATE_DIR = previousStateDir;
      await closeCodexAppServerClient();
      await rm(home, { recursive: true, force: true });
    },
  };
}
