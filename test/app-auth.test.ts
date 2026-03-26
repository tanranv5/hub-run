import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../api/app";
import { buildRuntimeConfig } from "../api/config";
import { readCookie } from "./helpers";

function createAuthApp() {
  return createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
    }),
  );
}

function createTrustedAuthApp() {
  return createApp(
    buildRuntimeConfig({
      host: "127.0.0.1",
      port: 12001,
      password: "secret-123",
      trustedOrigins: ["http://127.0.0.1"],
    }),
  );
}

function createRemoteAuthApp() {
  return createApp(
    buildRuntimeConfig({
      host: "0.0.0.0",
      port: 443,
      password: "secret-123",
    }),
  );
}

test("non-loopback host requires password", () => {
  assert.throws(
    () =>
      buildRuntimeConfig({
        host: "0.0.0.0",
        port: 12001,
      }),
    /password/i,
  );
});

test("providers route requires auth when password mode is enabled", async () => {
  const app = createAuthApp();
  const response = await app.request("/api/providers");

  assert.equal(response.status, 401);
});

test("login rejects invalid password", async () => {
  const app = createAuthApp();
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:12001",
    },
    body: JSON.stringify({ password: "wrong" }),
  });

  assert.equal(response.status, 401);
});

test("login returns cookie and unlocks provider routes", async () => {
  const app = createAuthApp();
  const loginResponse = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:12001",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  assert.equal(loginResponse.status, 200);
  const cookie = readCookie(loginResponse.headers.get("set-cookie"));

  const providersResponse = await app.request("/api/providers", {
    headers: {
      cookie,
    },
  });

  assert.equal(providersResponse.status, 200);
  const payload = await providersResponse.json();
  assert.equal(Array.isArray(payload.providers), true);
  assert.equal(payload.providers.length, 2);
});

test("login accepts localhost origin for loopback-bound server", async () => {
  const app = createAuthApp();
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:12001",
      origin: "http://localhost:12001",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  assert.equal(response.status, 200);
});

test("login accepts 127 origin when request host is localhost", async () => {
  const app = createAuthApp();
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "localhost:12001",
      origin: "http://127.0.0.1:12001",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  assert.equal(response.status, 200);
});

test("login rejects bare 127 origin without explicit trusted origin", async () => {
  const app = createAuthApp();
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:12001",
      origin: "http://127.0.0.1",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  assert.equal(response.status, 403);
});

test("login accepts configured trusted origin without port", async () => {
  const app = createTrustedAuthApp();
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:12001",
      origin: "http://127.0.0.1",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  assert.equal(response.status, 200);
});

test("login rejects invalid JSON with a 400 instead of a 500", async () => {
  const app = createAuthApp();
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:12001",
    },
    body: "{",
  });

  assert.equal(response.status, 400);
  assert.match(await response.text(), /valid json/i);
});

test("login marks the session cookie as Secure when the request is forwarded as https", async () => {
  const app = createRemoteAuthApp();
  const response = await app.request("https://hub-run.test/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "hub-run.test",
      origin: "https://hub-run.test",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ password: "secret-123" }),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /;\s*Secure\b/);
});
