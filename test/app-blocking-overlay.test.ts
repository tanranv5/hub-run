import assert from "node:assert/strict";
import test from "node:test";
import {
  assignCreateSessionBlockingSessionId,
  createPendingCreateSessionBlockingTarget,
  resolveAppBlockingOverlay,
  shouldReleaseCreateSessionBlocking,
} from "../web/app-blocking-overlay";

test("create-session blocking stays active until the target session出现首条真实消息", () => {
  const target = assignCreateSessionBlockingSessionId(
    createPendingCreateSessionBlockingTarget("codex"),
    "session-1",
  );

  assert.equal(
    shouldReleaseCreateSessionBlocking({
      conversationStream: {
        conversationStatusPhase: "generating",
        hasRenderableMessages: false,
        providerId: "codex",
        sessionId: "session-1",
        streamStatus: {
          phase: "live",
          lastEventAt: 123,
          retryCount: 0,
        },
      },
      selectedProviderId: "codex",
      selectedSessionId: "session-1",
      target,
    }),
    false,
  );

  assert.equal(
    shouldReleaseCreateSessionBlocking({
      conversationStream: {
        conversationStatusPhase: "generating",
        hasRenderableMessages: true,
        providerId: "codex",
        sessionId: "session-1",
        streamStatus: {
          phase: "live",
          lastEventAt: 123,
          retryCount: 0,
        },
      },
      selectedProviderId: "codex",
      selectedSessionId: "session-1",
      target,
    }),
    true,
  );
});

test("create-session blocking ignores live streams from a different session", () => {
  const target = assignCreateSessionBlockingSessionId(
    createPendingCreateSessionBlockingTarget("codex"),
    "session-target",
  );

  assert.equal(
    shouldReleaseCreateSessionBlocking({
      conversationStream: {
        conversationStatusPhase: "completed",
        hasRenderableMessages: true,
        providerId: "codex",
        sessionId: "session-other",
        streamStatus: {
          phase: "live",
          lastEventAt: 123,
          retryCount: 0,
        },
      },
      selectedProviderId: "codex",
      selectedSessionId: "session-target",
      target,
    }),
    false,
  );
});

test("blocking overlay gives create-session loading its own copy when no higher-priority overlay is active", () => {
  assert.deepEqual(
    resolveAppBlockingOverlay({
      createSessionTarget: createPendingCreateSessionBlockingTarget("codex"),
      providerSwitchLabel: null,
      runtimeRestarting: false,
    }),
    {
      description: "正在等待新会话首条消息出现，页面暂时不可操作。",
      label: "正在创建新会话...",
    },
  );

  assert.deepEqual(
    resolveAppBlockingOverlay({
      createSessionTarget: assignCreateSessionBlockingSessionId(
        createPendingCreateSessionBlockingTarget("codex"),
        "session-1",
      ),
      providerSwitchLabel: null,
      runtimeRestarting: false,
    }),
    {
      description: "正在等待新会话首条消息出现，页面暂时不可操作。",
      label: "正在等待新会话首条消息出现...",
    },
  );
});

test("provider switch overlay still has priority over create-session loading", () => {
  assert.deepEqual(
    resolveAppBlockingOverlay({
      createSessionTarget: assignCreateSessionBlockingSessionId(
        createPendingCreateSessionBlockingTarget("codex"),
        "session-1",
      ),
      providerSwitchLabel: "Claude",
      runtimeRestarting: false,
    }),
    {
      description: "切换 Provider，页面暂时不可操作。",
      label: "正在切换到 Claude...",
    },
  );
});

test("create-session blocking releases immediately when provider changes", () => {
  assert.equal(
    shouldReleaseCreateSessionBlocking({
      conversationStream: null,
      selectedProviderId: "claude",
      selectedSessionId: null,
      target: createPendingCreateSessionBlockingTarget("codex"),
    }),
    true,
  );
});

test("create-session blocking waits for stream confirmation even if selected session differs", () => {
  const target = assignCreateSessionBlockingSessionId(
    createPendingCreateSessionBlockingTarget("codex"),
    "session-target",
  );

  // selectedSessionId hasn't switched yet — should NOT release prematurely
  assert.equal(
    shouldReleaseCreateSessionBlocking({
      conversationStream: null,
      selectedProviderId: "codex",
      selectedSessionId: "session-other",
      target,
    }),
    false,
  );
});
