import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPanelRuntimeState,
  resolveSendStatus,
} from "../web/conversation-panel-send";
import { INITIAL_PANEL_STATE } from "../web/conversation-panel-state-types";
import {
  SEND_PHASE_TIMEOUT_MS,
  acceptSendLifecycle,
  advanceSendLifecycle,
  createSubmittedSendLifecycle,
  getSendLifecycleStatus,
  isSendLifecycleActive,
  syncSendLifecycle,
} from "../web/conversation-send-state";

const GENERATING_THREAD = {
  threadId: "thread-1",
  activeTurnId: "turn-1",
  isGenerating: true,
  requestedTurnId: "turn-1",
  requestedTurnStatus: "inProgress" as const,
};

test("send lifecycle advances from submitted to accepted to generating to synced to completed", () => {
  const submitted = createSubmittedSendLifecycle("codex", "thread-1", 1000);
  assert.equal(getSendLifecycleStatus(submitted), "消息已提交，等待服务接受...");
  assert.equal(isSendLifecycleActive(submitted), true);

  const accepted = acceptSendLifecycle(submitted, "thread-1", "turn-1", 1200);
  assert.equal(getSendLifecycleStatus(accepted), "消息已被接受，等待 Codex 开始处理...");

  const generating = advanceSendLifecycle(accepted, {
    now: 1400,
    threadState: GENERATING_THREAD,
  });
  assert.equal(getSendLifecycleStatus(generating), "Codex 已接受，正在生成...");

  const synced = syncSendLifecycle(generating, 1800);
  assert.equal(getSendLifecycleStatus(synced), "结果已同步到消息流，等待回合收尾...");

  const completed = advanceSendLifecycle(synced, {
    now: 2200,
    threadState: {
      ...GENERATING_THREAD,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnStatus: "completed",
    },
  });
  assert.equal(getSendLifecycleStatus(completed), "当前回合已完成");
  assert.equal(isSendLifecycleActive(completed), false);
});

test("send lifecycle can enter failed state from runtime status", () => {
  const accepted = acceptSendLifecycle(
    createSubmittedSendLifecycle("codex", "thread-1", 1000),
    "thread-1",
    "turn-1",
    1200,
  );

  const failed = advanceSendLifecycle(accepted, {
    now: 1500,
    threadState: {
      ...GENERATING_THREAD,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnStatus: "failed",
    },
  });

  assert.equal(getSendLifecycleStatus(failed), "当前回合执行失败");
  assert.equal(isSendLifecycleActive(failed), false);
});

test("send lifecycle can complete directly from accepted when runtime already finished", () => {
  const accepted = acceptSendLifecycle(
    createSubmittedSendLifecycle("codex", "thread-1", 1000),
    "thread-1",
    "turn-1",
    1200,
  );

  const completed = advanceSendLifecycle(accepted, {
    now: 1500,
    threadState: {
      ...GENERATING_THREAD,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnStatus: "completed",
    },
  });

  assert.equal(getSendLifecycleStatus(completed), "当前回合已完成");
  assert.equal(isSendLifecycleActive(completed), false);
});

test("send lifecycle can enter interrupted state from runtime status", () => {
  const generating = advanceSendLifecycle(
    acceptSendLifecycle(
      createSubmittedSendLifecycle("codex", "thread-1", 1000),
      "thread-1",
      "turn-1",
      1200,
    ),
    {
      now: 1400,
      threadState: GENERATING_THREAD,
    },
  );

  const interrupted = advanceSendLifecycle(generating, {
    now: 1500,
    threadState: {
      ...GENERATING_THREAD,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnStatus: "interrupted",
    },
  });

  assert.equal(getSendLifecycleStatus(interrupted), "当前回合已中断");
  assert.equal(isSendLifecycleActive(interrupted), false);
});

test("send lifecycle enters timed out when accepted state makes no progress after extended wait", () => {
  const accepted = acceptSendLifecycle(
    createSubmittedSendLifecycle("codex", "thread-1", 1000),
    "thread-1",
    "turn-1",
    1200,
  );

  const timedOut = advanceSendLifecycle(accepted, {
    now: 1200 + SEND_PHASE_TIMEOUT_MS * 2 + 1,
    threadState: {
      threadId: "thread-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-1",
      requestedTurnStatus: null,
    },
  });

  assert.equal(getSendLifecycleStatus(timedOut), "消息已被接受，但长时间没有同步结果");
  assert.equal(isSendLifecycleActive(timedOut), false);
});

test("resolveSendStatus falls back to completed runtime state when lifecycle is missing", () => {
  const status = resolveSendStatus({
    interrupting: false,
    lifecycle: null,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    threadState: {
      threadId: "thread-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "completed",
    },
  });

  assert.equal(status, "当前回合已完成");
});

test("resolveSendStatus prefers interrupted runtime status over a stale active lifecycle", () => {
  const lifecycle = advanceSendLifecycle(
    acceptSendLifecycle(
      createSubmittedSendLifecycle("codex", "thread-1", 1000),
      "thread-1",
      "turn-1",
      1200,
    ),
    {
      now: 1400,
      threadState: GENERATING_THREAD,
    },
  );

  const status = resolveSendStatus({
    interrupting: false,
    lifecycle,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    threadState: {
      ...GENERATING_THREAD,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnStatus: "interrupted",
    },
  });

  assert.equal(status, "当前回合已中断");
});

test("resolveSendStatus keeps completed runtime state even when the message stream is still live", () => {
  const status = resolveSendStatus({
    interrupting: false,
    lifecycle: null,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    streamActive: true,
    threadState: {
      threadId: "thread-1",
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-1",
      requestedTurnStatus: "completed",
    },
  });

  assert.equal(status, "当前回合已完成");
});

test("applyPanelRuntimeState emits terminal message on first completion then stabilises", () => {
  const completedThread = {
    threadId: "thread-1",
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: "turn-1",
    requestedTurnStatus: "completed" as const,
  };
  const first = applyPanelRuntimeState(
    {
      ...INITIAL_PANEL_STATE,
      sendLifecycle: acceptSendLifecycle(
        createSubmittedSendLifecycle("codex", "thread-1", 1_000),
        "thread-1",
        "turn-1",
        1_200,
      ),
      sending: true,
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          kind: "text",
          text: "最终回复",
        },
      ],
    },
    "codex",
    completedThread,
    [],
    2_000,
  );

  const second = applyPanelRuntimeState(
    first,
    "codex",
    completedThread,
    [],
    2_500,
  );

  assert.equal(first.messages.length, 2);
  assert.equal(first.messages[1]?.text, "任务已完成（turn=turn-1）");
  assert.equal(first.sendStatus, "当前回合已完成");
  assert.equal(first.pendingTerminalSyncTurnId, "turn-1");
  assert.equal(second.messages.length, 2);
  assert.equal(second.pendingTerminalSyncTurnId, "turn-1");
});
