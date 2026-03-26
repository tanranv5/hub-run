import assert from "node:assert/strict";
import test from "node:test";
import {
  REALTIME_STREAM_STALE_AFTER_MS,
  createConnectingRealtimeStreamStatus,
  createDisconnectedRealtimeStreamStatus,
  createIdleRealtimeStreamStatus,
  createLiveRealtimeStreamStatus,
  shouldDisconnectRealtimeStream,
} from "../web/realtime-stream-status";

test("realtime stream disconnect watchdog trips after heartbeat silence", () => {
  const live = createLiveRealtimeStreamStatus(1_000);
  const reconnecting = createConnectingRealtimeStreamStatus(live, 1);

  assert.equal(
    shouldDisconnectRealtimeStream({
      current: reconnecting,
      lastActivityAt: 1_000,
      now: 1_000 + REALTIME_STREAM_STALE_AFTER_MS,
    }),
    true,
  );
});

test("realtime stream disconnect watchdog stays quiet while heartbeat is still fresh", () => {
  assert.equal(
    shouldDisconnectRealtimeStream({
      current: createLiveRealtimeStreamStatus(5_000),
      lastActivityAt: 5_000,
      now: 5_000 + REALTIME_STREAM_STALE_AFTER_MS - 1,
    }),
    false,
  );
});

test("disconnected stream status preserves last event timestamp and retry count", () => {
  const next = createDisconnectedRealtimeStreamStatus({
    phase: "reconnecting",
    lastEventAt: 4_200,
    retryCount: 3,
  });

  assert.equal(next.phase, "disconnected");
  assert.equal(next.lastEventAt, 4_200);
  assert.equal(next.retryCount, 3);
});

test("idle stream never becomes disconnected through the watchdog", () => {
  assert.equal(
    shouldDisconnectRealtimeStream({
      current: createIdleRealtimeStreamStatus(),
      lastActivityAt: null,
      now: Date.now(),
    }),
    false,
  );
});
