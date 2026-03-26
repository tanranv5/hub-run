import assert from "node:assert/strict";
import test from "node:test";
import { handleRealtimeStreamError, subscribeAuthLost } from "../web/realtime-auth";

test("realtime stream error stops reconnecting when auth expires", async () => {
  let reconnecting = false;
  let scheduledDelay: number | null = null;
  let authLostCount = 0;
  const unsubscribe = subscribeAuthLost(() => {
    authLostCount += 1;
  });

  try {
    const stopped = await handleRealtimeStreamError({
      isClosed: () => false,
      retryCount: 2,
      getRetryDelay: () => 4_000,
      scheduleReconnect: (delay) => {
        scheduledDelay = delay;
      },
      setReconnecting: () => {
        reconnecting = true;
      },
      readAuthStatus: async () => ({
        authEnabled: true,
        authenticated: false,
      }),
    });

    assert.equal(stopped, true);
    assert.equal(reconnecting, false);
    assert.equal(scheduledDelay, null);
    assert.equal(authLostCount, 1);
  } finally {
    unsubscribe();
  }
});

test("realtime stream error keeps reconnecting on transient failures", async () => {
  let reconnecting = false;
  let scheduledDelay: number | null = null;

  const stopped = await handleRealtimeStreamError({
    isClosed: () => false,
    retryCount: 1,
    getRetryDelay: (retryCount) => retryCount * 2_000,
    scheduleReconnect: (delay) => {
      scheduledDelay = delay;
    },
    setReconnecting: () => {
      reconnecting = true;
    },
    readAuthStatus: async () => ({
      authEnabled: true,
      authenticated: true,
    }),
  });

  assert.equal(stopped, false);
  assert.equal(reconnecting, true);
  assert.equal(scheduledDelay, 2_000);
});
