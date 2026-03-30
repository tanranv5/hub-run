import type { RealtimeStreamStatus } from "./realtime-stream-status";
import type { ProviderThreadState } from "../api/types";

export type ConversationSessionStatusTone =
  | "neutral"
  | "active"
  | "success"
  | "danger";

export function getConversationSessionStatusLabel(
  sendAvailable: boolean,
  streamStatus: RealtimeStreamStatus,
  threadState: ProviderThreadState | null = null,
) {
  if (!sendAvailable) {
    return "当前会话只读";
  }
  if (threadState?.desynced) {
    if (threadState.desyncReason === "activeFileWriteWithInterruptedTurn") {
      return "当前会话生成中";
    }
    return "当前会话状态同步中";
  }
  if (threadState?.isGenerating) {
    return "当前会话生成中";
  }
  if (threadState?.requestedTurnStatus === "completed") {
    return "当前回合已完成";
  }
  if (threadState?.requestedTurnStatus === "interrupted") {
    return "当前回合已中断";
  }
  if (threadState?.requestedTurnStatus === "failed") {
    return "当前回合执行失败";
  }

  switch (streamStatus.phase) {
    case "idle":
      return "当前会话可发送";
    case "connecting":
      return "当前会话消息流连接中";
    case "live":
      return "当前会话消息流已连接";
    case "reconnecting":
      return "当前会话消息流重连中";
    case "disconnected":
      return "当前会话消息流未连接";
  }
}

export function getConversationSessionStatusTone(
  sendAvailable: boolean,
  streamStatus: RealtimeStreamStatus,
  threadState: ProviderThreadState | null = null,
): ConversationSessionStatusTone {
  if (!sendAvailable) {
    return "danger";
  }
  if (threadState?.desynced) {
    return "active";
  }
  if (threadState?.isGenerating) {
    return "active";
  }
  if (threadState?.requestedTurnStatus === "completed") {
    return "success";
  }
  if (
    threadState?.requestedTurnStatus === "interrupted" ||
    threadState?.requestedTurnStatus === "failed"
  ) {
    return "danger";
  }

  switch (streamStatus.phase) {
    case "idle":
    case "live":
      return "neutral";
    case "connecting":
    case "reconnecting":
      return "active";
    case "disconnected":
      return "danger";
  }
}
