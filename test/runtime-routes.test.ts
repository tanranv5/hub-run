import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { AsrRegistry } from "../api/asr/types";
import { createApp } from "../api/app";
import { buildRuntimeConfig, type HubRunOptions } from "../api/config";
import { RuntimeControllerError, type RuntimeController } from "../api/runtime-control";
import type { ProviderAdapter, ProviderId } from "../api/types";
import { readCookie } from "./helpers";

const TEST_HOST = "127.0.0.1";
const TEST_PORT = 12_001;
const TEST_PASSWORD = "secret-123";
const TEST_HOST_HEADER = `${TEST_HOST}:${TEST_PORT}`;
const TEST_ORIGIN = `http://${TEST_HOST_HEADER}`;
const EMPTY_REGISTRY = {} as Record<ProviderId, ProviderAdapter>;
const EMPTY_ASR_REGISTRY = {} as AsrRegistry;

function createRuntimeConfig(overrides: Partial<HubRunOptions> = {}) {
  return buildRuntimeConfig({
    host: TEST_HOST,
    port: TEST_PORT,
    password: TEST_PASSWORD,
    ...overrides,
  });
}

function createRuntimeApp(props: {
  runtimeController?: RuntimeController;
  trustedOrigins?: string[];
} = {}) {
  return createApp(createRuntimeConfig({ trustedOrigins: props.trustedOrigins }), {
    registry: EMPTY_REGISTRY,
    asrRegistry: EMPTY_ASR_REGISTRY,
    runtimeController: props.runtimeController ?? {
      restart: async () => {},
    },
  });
}

async function login(app: ReturnType<typeof createApp>) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: TEST_HOST_HEADER,
      origin: TEST_ORIGIN,
    },
    body: JSON.stringify({ password: TEST_PASSWORD }),
  });

  assert.equal(response.status, 200);
  return readCookie(response.headers.get("set-cookie"));
}

function createWriteHeaders(cookie: string, origin = TEST_ORIGIN) {
  return {
    cookie,
    host: TEST_HOST_HEADER,
    origin,
  };
}

test("runtime routes require auth", async () => {
  const app = createRuntimeApp();
  const response = await app.request("/api/runtime/path-exists?path=/tmp");

  assert.equal(response.status, 401);
});

test("runtime restart route restarts the runtime for authenticated same-origin requests", async () => {
  let restartCalls = 0;
  const app = createRuntimeApp({
    runtimeController: {
      restart: async () => {
        restartCalls += 1;
      },
    },
  });

  const cookie = await login(app);
  const response = await app.request("/api/runtime/restart", {
    method: "POST",
    headers: createWriteHeaders(cookie),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, restarting: true });
  assert.equal(restartCalls, 1);
});

test("runtime restart route rejects invalid origins before touching the runtime controller", async () => {
  let restartCalls = 0;
  const app = createRuntimeApp({
    runtimeController: {
      restart: async () => {
        restartCalls += 1;
      },
    },
  });

  const cookie = await login(app);
  const response = await app.request("/api/runtime/restart", {
    method: "POST",
    headers: createWriteHeaders(cookie, "http://evil.test"),
  });

  assert.equal(response.status, 403);
  assert.equal(restartCalls, 0);
  assert.deepEqual(await response.json(), {
    error: {
      code: "AUTH_REQUIRED",
      message:
        "Origin check failed (origin=http://evil.test, host=127.0.0.1:12001, target=127.0.0.1:12001)",
    },
  });
});

test("runtime restart route forwards RuntimeControllerError status and message", async () => {
  const app = createRuntimeApp({
    runtimeController: {
      restart: async () => {
        throw new RuntimeControllerError("Runtime service not found", 404);
      },
    },
  });

  const cookie = await login(app);
  const response = await app.request("/api/runtime/restart", {
    method: "POST",
    headers: createWriteHeaders(cookie),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INTERNAL_ERROR",
      message: "Runtime service not found",
    },
  });
});

test("runtime restart route forwards unexpected Error messages as 500 responses", async () => {
  const app = createRuntimeApp({
    runtimeController: {
      restart: async () => {
        throw new Error("restart exploded");
      },
    },
  });

  const cookie = await login(app);
  const response = await app.request("/api/runtime/restart", {
    method: "POST",
    headers: createWriteHeaders(cookie),
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INTERNAL_ERROR",
      message: "restart exploded",
    },
  });
});

test("runtime restart route falls back to a generic 500 message for non-Error throws", async () => {
  const app = createRuntimeApp({
    runtimeController: {
      restart: async () => {
        throw "bad-runtime-state";
      },
    },
  });

  const cookie = await login(app);
  const response = await app.request("/api/runtime/restart", {
    method: "POST",
    headers: createWriteHeaders(cookie),
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: "INTERNAL_ERROR",
      message: "Failed to restart runtime",
    },
  });
});

test("runtime path-exists reports empty, missing, file, and directory states", async (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), "hub-run-runtime-routes-"));
  const directoryPath = join(tempRoot, "workspace");
  const filePath = join(tempRoot, "runtime.json");
  const missingPath = join(tempRoot, "missing");

  mkdirSync(directoryPath);
  writeFileSync(filePath, "{}");
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const app = createRuntimeApp();
  const cookie = await login(app);

  const emptyResponse = await app.request("/api/runtime/path-exists?path=%20%20", {
    headers: { cookie },
  });
  const missingResponse = await app.request(
    `/api/runtime/path-exists?path=${encodeURIComponent(missingPath)}`,
    { headers: { cookie } },
  );
  const fileResponse = await app.request(
    `/api/runtime/path-exists?path=${encodeURIComponent(filePath)}`,
    { headers: { cookie } },
  );
  const directoryResponse = await app.request(
    `/api/runtime/path-exists?path=${encodeURIComponent(directoryPath)}`,
    { headers: { cookie } },
  );

  assert.deepEqual(await emptyResponse.json(), {
    exists: false,
    isDirectory: false,
  });
  assert.deepEqual(await missingResponse.json(), {
    exists: false,
    isDirectory: false,
  });
  assert.deepEqual(await fileResponse.json(), {
    exists: true,
    isDirectory: false,
  });
  assert.deepEqual(await directoryResponse.json(), {
    exists: true,
    isDirectory: true,
  });
});
