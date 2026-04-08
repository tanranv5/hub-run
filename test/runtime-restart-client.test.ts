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
      } as Response;
    },
    intervalMs: 25,
    timeoutMs: 500,
  });

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 25]);
});

test("restartRuntimeAndRefresh waits for health before reloading app data", async () => {
  const calls: string[] = [];

  await restartRuntimeAndRefresh({
    refresh: async () => {
      calls.push("refresh");
    },
    restartRuntime: async () => {
      calls.push("restart");
      return { ok: true, restarting: true };
    },
    waitForHealth: async () => {
      calls.push("wait");
    },
  });

  assert.deepEqual(calls, ["restart", "wait", "refresh"]);
});
