import type { ProviderId, ProviderThreadState } from "../api/types";

export const SEND_PHASE_TIMEOUT_MS = 30_000;

export type SendPhase =
  | "submitted"
  | "accepted"
  | "generating"
  | "synced"
  | "completed"
  | "interrupted"
  | "failed"
  | "timedOut";

export interface SendLifecycle {
  providerId: ProviderId;
  sessionId: string;
  turnId: string | null;
  phase: SendPhase;
  lastProgressAt: number;
}

export function createSubmittedSendLifecycle(
  providerId: ProviderId,
  sessionId: string,
  now: number,
): SendLifecycle {
  return {
    providerId,
    sessionId,
    turnId: null,
    phase: "submitted",
    lastProgressAt: now,
  };
}

export function acceptSendLifecycle(
  current: SendLifecycle,
  sessionId: string,
  turnId: string | null,
  now: number,
): SendLifecycle {
  return {
    ...current,
    sessionId,
    turnId,
    phase: "accepted",
    lastProgressAt: now,
  };
}

export function syncSendLifecycle(
  current: SendLifecycle,
  now: number,
): SendLifecycle {
  if (isTerminalPhase(current.phase) || current.phase === "synced") {
    return current;
  }
  return {
    ...current,
    phase: current.providerId === "codex" ? "synced" : "completed",
    lastProgressAt: now,
  };
}

export function advanceSendLifecycle(
  current: SendLifecycle,
  props: {
    now: number;
    threadState: ProviderThreadState | null;
  },
): SendLifecycle {
  const { now, threadState } = props;
  const terminalPhase = getTerminalTurnPhase(threadState);
  if (terminalPhase) {
    return setPhase(current, terminalPhase, now);
  }
  if (threadState?.isGenerating) {
    return setPhase(current, "generating", now);
  }
  // In "accepted" phase, the turn may still be queuing on the server.
  // Only timeout if we've been waiting with zero progress signals for a long time.
  // Don't timeout if threadState is simply not yet populated (null).
  if (
    !threadState?.isGenerating &&
    isPendingPhase(current.phase) &&
    current.phase !== "accepted" &&
    now - current.lastProgressAt > SEND_PHASE_TIMEOUT_MS
  ) {
    return setPhase(current, "timedOut", now);
  }
  // For "accepted" phase, use a longer tolerance — only timeout if we never saw generating
  if (
    current.phase === "accepted" &&
    now - current.lastProgressAt > SEND_PHASE_TIMEOUT_MS * 2
  ) {
    return setPhase(current, "timedOut", now);
  }
  return current;
}

export function timeoutSendLifecycle(
  current: SendLifecycle,
  now: number,
): SendLifecycle {
  return setPhase(current, "timedOut", now);
}

export function isSendLifecycleActive(current: SendLifecycle): boolean {
  return !isTerminalPhase(current.phase);
}

export function getSendLifecycleStatus(current: SendLifecycle): string {
  switch (current.phase) {
    case "submitted":
      return "消息已提交，等待服务接受...";
    case "accepted":
      return "消息已被接受，等待 Codex 开始处理...";
    case "generating":
      return "Codex 已接受，正在生成...";
    case "synced":
      return "结果已同步到消息流，等待回合收尾...";
    case "completed":
      return "当前回合已完成";
    case "interrupted":
      return "当前回合已中断";
    case "failed":
      return "当前回合执行失败";
    case "timedOut":
      return "当前回合长时间无输出，可能已卡死";
  }
}

function isPendingPhase(phase: SendPhase): boolean {
  return (
    phase === "submitted" ||
    phase === "accepted" ||
    phase === "generating" ||
    phase === "synced"
  );
}

function isTerminalPhase(phase: SendPhase): boolean {
  return (
    phase === "completed" ||
    phase === "interrupted" ||
    phase === "failed" ||
    phase === "timedOut"
  );
}

function getTerminalTurnPhase(
  threadState: ProviderThreadState | null,
): SendPhase | null {
  if (!threadState || threadState.isGenerating) {
    return null;
  }
  switch (threadState.requestedTurnStatus) {
    case "completed":
      return "completed";
    case "interrupted":
      return "interrupted";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function setPhase(
  current: SendLifecycle,
  phase: SendPhase,
  now: number,
): SendLifecycle {
  if (current.phase === phase) {
    return current;
  }
  return {
    ...current,
    phase,
    lastProgressAt: now,
  };
}
