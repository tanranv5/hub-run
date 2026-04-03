import type {
  ConversationMessage,
  ProviderId,
  ProviderThreadState,
  ProviderUserInputRequest,
} from "../api/types";
import { hasConversationChanged } from "./conversation-panel-state-helpers";
import {
  hasEquivalentStatusMessage,
  stripOptimisticUserMessages,
} from "./conversation-panel-state-helpers";
import type { PanelState } from "./conversation-panel-state-types";
import {
  acceptSendLifecycle,
  advanceSendLifecycle,
  createSubmittedSendLifecycle,
  getSendLifecycleStatus,
  isSendLifecycleActive,
  syncSendLifecycle,
  timeoutSendLifecycle,
  type SendLifecycle,
} from "./conversation-send-state";

export function beginPanelSendLifecycle(
  current: PanelState,
  providerId: ProviderId,
  sessionId: string,
  now: number,
): PanelState {
  return applySendLifecycle(
    {
      ...current,
      pendingTerminalSyncTurnId: null,
    },
    providerId,
    createSubmittedSendLifecycle(providerId, sessionId, now),
  );
}

export function acceptPanelSendLifecycle(
  current: PanelState,
  providerId: ProviderId,
  sessionId: string,
  turnId: string | null,
  now: number,
): PanelState {
  if (!current.sendLifecycle) {
    return current;
  }
  return applySendLifecycle(
    current,
    providerId,
    acceptSendLifecycle(current.sendLifecycle, sessionId, turnId, now),
  );
}

export function syncPanelSendLifecycle(
  current: PanelState,
  providerId: ProviderId,
  nextMessages: PanelState["messages"],
  now: number,
): PanelState {
  if (!current.sendLifecycle || !hasConversationChanged(current.messages, nextMessages)) {
    return current;
  }
  return applySendLifecycle(
    current,
    providerId,
    syncSendLifecycle(current.sendLifecycle, now),
  );
}

export function applyPanelRuntimeState(
  current: PanelState,
  providerId: ProviderId,
  threadState: ProviderThreadState | null,
  pendingUserInputRequests: ProviderUserInputRequest[],
  now: number,
): PanelState {
  const previousLifecycle = current.sendLifecycle;
  const nextLifecycle = previousLifecycle
    ? advanceSendLifecycle(previousLifecycle, { now, threadState })
    : null;

  const result = applySendLifecycle(
    {
      ...current,
      pendingTerminalSyncTurnId: resolvePendingTerminalSyncTurnId(
        current,
        threadState,
      ),
      threadState,
      pendingUserInputRequests,
    },
    providerId,
    nextLifecycle,
  );

  const terminalMessage = buildTerminalTransitionMessage(
    previousLifecycle,
    nextLifecycle,
    threadState,
    now,
  );
  if (terminalMessage && !hasEquivalentStatusMessage(result.messages, terminalMessage)) {
    return { ...result, messages: [...result.messages, terminalMessage] };
  }
  return result;
}

export function timeoutPanelSendLifecycle(
  current: PanelState,
  providerId: ProviderId,
  now: number,
): PanelState {
  if (!current.sendLifecycle) {
    return current;
  }
  return applySendLifecycle(
    current,
    providerId,
    timeoutSendLifecycle(current.sendLifecycle, now),
  );
}

export function resolveSendStatus(props: {
  interrupting: boolean;
  lifecycle: SendLifecycle | null;
  pendingUserInputRequests: ProviderUserInputRequest[];
  providerId: ProviderId;
  respondingRequestId: string | null;
  streamActive?: boolean;
  threadState: ProviderThreadState | null;
}): string | null {
  const {
    interrupting,
    lifecycle,
    pendingUserInputRequests,
    providerId,
    respondingRequestId,
    threadState,
  } = props;
  if (interrupting) {
    return "正在中断当前回合...";
  }
  if (respondingRequestId) {
    return "正在提交用户输入...";
  }
  if (pendingUserInputRequests.length > 0) {
    return "Codex 等待用户输入";
  }
  const runtimeTerminalStatus = getRuntimeTerminalStatus(providerId, threadState);
  if (runtimeTerminalStatus) {
    return runtimeTerminalStatus;
  }
  if (lifecycle) {
    return getSendLifecycleStatus(lifecycle);
  }
  if (providerId === "codex" && threadState?.isGenerating) {
    return "Codex 正在生成...";
  }
  return null;
}

export function appendMissingRuntimeTerminalStatusMessage(
  messages: ConversationMessage[],
  providerId: ProviderId,
  threadState: ProviderThreadState | null,
  now: number,
): ConversationMessage[] {
  const terminalMessage = buildRuntimeTerminalStatusMessage(
    providerId,
    threadState,
    now,
  );
  if (!terminalMessage || hasEquivalentStatusMessage(messages, terminalMessage)) {
    return messages;
  }
  return [...messages, terminalMessage];
}

function getRuntimeTerminalStatus(
  providerId: ProviderId,
  threadState: ProviderThreadState | null,
): string | null {
  if (providerId !== "codex" || !threadState || threadState.isGenerating) {
    return null;
  }
  if (threadState.stalled) {
    return "当前回合长时间无输出，可能已卡死";
  }
  switch (threadState.requestedTurnStatus) {
    case "completed":
      return "当前回合已完成";
    case "interrupted":
      return "当前回合已中断";
    case "failed":
      return "当前回合执行失败";
    default:
      return null;
  }
}

function buildRuntimeTerminalStatusMessage(
  providerId: ProviderId,
  threadState: ProviderThreadState | null,
  now: number,
): ConversationMessage | null {
  if (
    providerId !== "codex" ||
    !threadState ||
    threadState.isGenerating ||
    !threadState.requestedTurnStatus
  ) {
    return null;
  }
  const label = getTerminalTransitionLabel(
    threadState.requestedTurnStatus,
    threadState.requestedTurnId,
  );
  if (!label) {
    return null;
  }
  return {
    id: `terminal-status:${now}`,
    role: "system",
    kind: "text",
    title: "status",
    text: label,
    timestamp: new Date(now).toISOString(),
  };
}

function applySendLifecycle(
  current: PanelState,
  providerId: ProviderId,
  lifecycle: SendLifecycle | null,
): PanelState {
  const wasActive = current.sendLifecycle ? isSendLifecycleActive(current.sendLifecycle) : false;
  const isActive = lifecycle ? isSendLifecycleActive(lifecycle) : false;
  const becameTerminal = wasActive && !isActive;
  const inferredGenerating = current.threadState?.isGenerating ?? false;
  return {
    ...current,
    messages: becameTerminal ? stripOptimisticUserMessages(current.messages) : current.messages,
    sendLifecycle: lifecycle,
    sending: lifecycle ? isActive : inferredGenerating ?? false,
    sendStatus: resolveSendStatus({
      interrupting: current.interrupting,
      lifecycle,
      pendingUserInputRequests: current.pendingUserInputRequests,
      providerId,
      respondingRequestId: current.respondingRequestId,
      threadState: current.threadState,
    }),
  };
}

function resolvePendingTerminalSyncTurnId(
  current: PanelState,
  threadState: ProviderThreadState | null,
): string | null {
  if (current.pendingTerminalSyncTurnId) {
    return current.pendingTerminalSyncTurnId;
  }
  if (!current.sendLifecycle || !isSendLifecycleActive(current.sendLifecycle)) {
    return null;
  }

  const terminalTurnId = getRuntimeTerminalTurnId(threadState);
  if (!terminalTurnId) {
    return null;
  }
  if (
    current.sendLifecycle.turnId &&
    current.sendLifecycle.turnId !== terminalTurnId
  ) {
    return null;
  }
  return terminalTurnId;
}

function getRuntimeTerminalTurnId(
  threadState: ProviderThreadState | null,
): string | null {
  if (!threadState || threadState.isGenerating || !threadState.requestedTurnId) {
    return null;
  }
  switch (threadState.requestedTurnStatus) {
    case "completed":
    case "interrupted":
    case "failed":
      return threadState.requestedTurnId;
    default:
      return null;
  }
}

function buildTerminalTransitionMessage(
  previous: SendLifecycle | null,
  next: SendLifecycle | null,
  threadState: ProviderThreadState | null,
  now: number,
): import("../api/types").ConversationMessage | null {
  if (!previous || !next) return null;
  const wasActive = isSendLifecycleActive(previous);
  const isActive = isSendLifecycleActive(next);
  if (!wasActive || isActive) return null;

  const label = getTerminalTransitionLabel(
    next.phase,
    next.turnId ?? threadState?.requestedTurnId ?? null,
  );
  if (!label) return null;

  return {
    id: `terminal-status:${now}`,
    role: "system",
    kind: "text",
    title: "status",
    text: label,
    timestamp: new Date(now).toISOString(),
  };
}

function getTerminalTransitionLabel(
  phase: SendLifecycle["phase"],
  turnId: string | null,
): string | null {
  const suffix = turnId ? `（turn=${turnId}）` : "";
  switch (phase) {
    case "completed":
      return `任务已完成${suffix}`;
    case "interrupted":
      return `任务已中断${suffix}`;
    case "failed":
      return `任务执行失败${suffix}`;
    case "timedOut":
      return "任务响应超时";
    default:
      return null;
  }
}
