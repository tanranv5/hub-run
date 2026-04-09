import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { probeHealth, waitForHealth } from "../scripts/runtime-health";

test("probeHealth returns ok and bootId for a 200 response", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, bootId: "boot-1" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const health = await probeHealth(
    `http://127.0.0.1:${address.port}/api/auth/status`,
    `http://127.0.0.1:${address.port}`,
    200,
  );
  assert.deepEqual(health, { ok: true, bootId: "boot-1" });

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test("waitForHealth resolves once a delayed server starts responding", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, bootId: "boot-1" }));
  });
  const port = 12189;

  setTimeout(() => {
    server.listen(port, "127.0.0.1");
  }, 300);

  await waitForHealth({
    endpoint: "/api/auth/status",
    host: "127.0.0.1",
    intervalMs: 50,
    port,
    requestTimeoutMs: 100,
    timeoutMs: 2_000,
  });

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test("waitForHealth keeps polling until bootId changes", async () => {
  let requestCount = 0;
  const server = createServer((_request, response) => {
    requestCount += 1;
    const bootId = requestCount < 3 ? "boot-1" : "boot-2";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, bootId }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  await waitForHealth({
    endpoint: "/api/health",
    host: "127.0.0.1",
    intervalMs: 10,
    port: address.port,
    previousBootId: "boot-1",
    requestTimeoutMs: 100,
    timeoutMs: 500,
  });

  assert.equal(requestCount, 3);

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});
