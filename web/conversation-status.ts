import type { ProviderId, ProviderThreadState, ProviderUserInputRequest } from "../api/types";
import type { RealtimeStreamStatus } from "./realtime-stream-status";
import type { SendLifecycle } from "./conversation-send-state";
import { isSendLifecycleActive } from "./conversation-send-state";

export type ConversationStatusPhase =
  | "loading"
  | "readonly"
  | "interrupting"
  | "respondingInput"
  | "waitingInput"
  | "syncing"
  | "sending"
  | "generating"
  | "completed"
  | "interrupted"
  | "failed"
  | "streamError"
  | "idle";

export type ConversationStatusTone =
  | "neutral"
  | "active"
  | "success"
  | "danger";

export interface ConversationStatus {
  phase: ConversationStatusPhase;
  label: string;
  tone: ConversationStatusTone;
}

export function resolveConversationStatus(props: {
  interrupting: boolean;
  lifecycle: SendLifecycle | null;
  loading: boolean;
  pendingUserInputRequests: ProviderUserInputRequest[];
  providerId: ProviderId;
  respondingRequestId: string | null;
  sendAvailable: boolean;
  streamStatus: RealtimeStreamStatus;
  threadState: ProviderThreadState | null;
}): ConversationStatus {
  const {
    interrupting,
    lifecycle,
    loading,
    pendingUserInputRequests,
    respondingRequestId,
    sendAvailable,
    streamStatus,
    threadState,
  } = props;

  // 1. 加载中
  if (loading) {
    return { phase: "loading", label: "加载中", tone: "neutral" };
  }

  // 2. 只读
  if (!sendAvailable) {
    return { phase: "readonly", label: "当前会话只读", tone: "danger" };
  }

  // 3. 中断中
  if (interrupting) {
    return { phase: "interrupting", label: "正在中断当前回合...", tone: "active" };
  }

  // 4. 提交用户输入
  if (respondingRequestId) {
    return { phase: "respondingInput", label: "正在提交用户输入...", tone: "active" };
  }

  // 5. 等待用户输入
  if (pendingUserInputRequests.length > 0) {
    return { phase: "waitingInput", label: "Codex 等待用户输入", tone: "active" };
  }

  // 6. 发送中（lifecycle 活跃）
  if (lifecycle && isSendLifecycleActive(lifecycle)) {
    return { phase: "sending", label: getSendingLabel(lifecycle), tone: "active" };
  }

  // 7. 状态同步中
  if (threadState?.desynced) {
    return { phase: "syncing", label: "状态同步中", tone: "active" };
  }

  // 8. 终态：完成/中断/失败
  if (threadState?.requestedTurnStatus === "completed") {
    return { phase: "completed", label: "当前回合已完成", tone: "success" };
  }
  if (threadState?.requestedTurnStatus === "interrupted") {
    return { phase: "interrupted", label: "当前回合已中断", tone: "danger" };
  }
  if (threadState?.requestedTurnStatus === "failed") {
    return { phase: "failed", label: "当前回合执行失败", tone: "danger" };
  }

  // 9. 正在生成
  if (threadState?.isGenerating) {
    return { phase: "generating", label: "正在生成...", tone: "active" };
  }

  // 10. 连接异常
  if (streamStatus.phase === "disconnected") {
    return { phase: "streamError", label: "消息流未连接", tone: "danger" };
  }
  if (streamStatus.phase === "reconnecting") {
    return { phase: "streamError", label: "消息流重连中", tone: "active" };
  }

  // 11. 空闲
  return { phase: "idle", label: "就绪", tone: "neutral" };
}

function getSendingLabel(lifecycle: SendLifecycle): string {
  switch (lifecycle.phase) {
    case "submitted":
      return "消息已提交，等待服务接受...";
    case "accepted":
      return "消息已被接受，等待处理...";
    case "generating":
      return "正在生成...";
    case "synced":
      return "等待回合收尾...";
    case "timedOut":
      return "等待服务响应...";
    default:
      return "发送中...";
  }
}

/** Derive the composer placeholder text from the unified status. */
export function getStatusPlaceholder(status: ConversationStatus): string {
  switch (status.phase) {
    case "loading":
      return "加载中...";
    case "readonly":
      return "当前会话只读";
    case "interrupting":
      return "中断中...";
    case "respondingInput":
      return "提交中...";
    case "waitingInput":
      return "等待输入";
    case "syncing":
      return "状态同步中...";
    case "sending":
    case "generating":
      return "生成中...";
    case "completed":
      return "任务完成";
    case "interrupted":
      return "已中断";
    case "failed":
      return "执行失败";
    case "streamError":
      return status.label;
    case "idle":
      return "等待输入";
  }
}

/** Derive the composer send button label from the unified status. */
export function getStatusButtonLabel(status: ConversationStatus, sending: boolean): string | null {
  if (!sending) {
    return null;
  }
  switch (status.phase) {
    case "sending":
    case "generating":
      return "生成中";
    case "interrupting":
      return "中断中";
    default:
      return "运行中";
  }
}

/** Whether the conversation has an active operation (send/generate/interrupt). */
export function isConversationBusy(status: ConversationStatus): boolean {
  return (
    status.phase === "sending" ||
    status.phase === "syncing" ||
    status.phase === "generating" ||
    status.phase === "interrupting" ||
    status.phase === "respondingInput"
  );
}
