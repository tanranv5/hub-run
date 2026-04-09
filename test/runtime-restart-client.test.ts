import test from "node:test";
import assert from "node:assert/strict";
import {
  restartRuntimeAndRefresh,
  waitForRuntimeHealth,
} from "../web/runtime-restart";

test("waitForRuntimeHealth keeps polling until the runtime health endpoint comes back", async () => {
  let attempts = 0;
  const delays: number[] = [];

  await waitForRuntimeHealth({
    delay: async (ms) => {
      delays.push(ms);
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("offline");
      }
      return {
        ok: true,
        json: async () => ({ bootId: "boot-2" }),
      } as Response;
    },
    initialDelayMs: 0,
    intervalMs: 25,
    previousBootId: "boot-1",
    timeoutMs: 500,
  });

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [0, 25, 25]);
});

test("waitForRuntimeHealth keeps polling while the process boot id has not changed yet", async () => {
  let attempts = 0;

  await waitForRuntimeHealth({
    delay: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      const bootId = attempts < 3 ? "boot-1" : "boot-2";
      return {
        ok: true,
        json: async () => ({ bootId }),
      } as Response;
    },
    initialDelayMs: 0,
    intervalMs: 1,
    previousBootId: "boot-1",
    timeoutMs: 100,
  });

  assert.equal(attempts, 3);
});

test("restartRuntimeAndRefresh waits for a new boot id before reloading app data", async () => {
  const calls: string[] = [];

  await restartRuntimeAndRefresh({
    refresh: async () => {
      calls.push("refresh");
    },
    readRuntimeHealth: async () => {
      calls.push("read");
      return { ok: true, bootId: "boot-1" };
    },
    restartRuntime: async () => {
      calls.push("restart");
      return { ok: true, restarting: true, bootId: "boot-1" };
    },
    waitForHealth: async (props = {}) => {
      calls.push(`wait:${props.previousBootId ?? "missing"}`);
    },
  });

  assert.deepEqual(calls, ["read", "restart", "wait:boot-1", "refresh"]);
});
