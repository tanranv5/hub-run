import type { ProviderId } from "../api/types";
import type { ConversationStatusPhase } from "./conversation-status";
import type { RealtimeStreamStatus } from "./realtime-stream-status";

const CREATE_SESSION_STARTING_LABEL = "正在创建新会话...";
const CREATE_SESSION_CONNECTING_LABEL = "正在等待新会话首条消息出现...";
const CREATE_SESSION_DESCRIPTION = "正在等待新会话首条消息出现，页面暂时不可操作。";
const PROVIDER_SWITCH_DESCRIPTION = "切换 Provider，页面暂时不可操作。";
const RUNTIME_RESTART_LABEL = "正在重启 hub-run 运行时...";
const RUNTIME_RESTART_DESCRIPTION = "正在等待 hub-run 运行时恢复，页面暂时不可操作。";

export const CREATE_SESSION_BLOCKING_TIMEOUT_MS = 10_000;

export interface CreateSessionBlockingTarget {
  providerId: ProviderId;
  sessionId: string | null;
  startedAt: number;
}

export interface ConversationStreamBinding {
  providerId: ProviderId | null;
  sessionId: string | null;
  conversationStatusPhase: ConversationStatusPhase | null;
  hasRenderableMessages: boolean;
  streamStatus: RealtimeStreamStatus | null;
}

export function createPendingCreateSessionBlockingTarget(
  providerId: ProviderId,
): CreateSessionBlockingTarget {
  return {
    providerId,
    sessionId: null,
    startedAt: Date.now(),
  };
}

export function assignCreateSessionBlockingSessionId(
  target: CreateSessionBlockingTarget,
  sessionId: string,
): CreateSessionBlockingTarget {
  return {
    ...target,
    sessionId,
  };
}

export function shouldReleaseCreateSessionBlocking(props: {
  conversationStream: ConversationStreamBinding | null;
  selectedProviderId: ProviderId | null;
  selectedSessionId: string | null;
  target: CreateSessionBlockingTarget | null;
}) {
  const { conversationStream, selectedProviderId, selectedSessionId, target } = props;
  if (!target) {
    return false;
  }
  // Release immediately if the user has navigated away from the target provider
  if (selectedProviderId !== target.providerId) {
    return true;
  }
  if (!target.sessionId) {
    return false;
  }
  // Wait until stream binding confirms the target session is active
  if (
    conversationStream?.providerId !== target.providerId ||
    conversationStream.sessionId !== target.sessionId
  ) {
    return false;
  }
  return conversationStream.hasRenderableMessages;
}

export function resolveAppBlockingOverlay(props: {
  createSessionTarget: CreateSessionBlockingTarget | null;
  providerSwitchLabel: string | null;
  runtimeRestarting: boolean;
}) {
  const { createSessionTarget, providerSwitchLabel, runtimeRestarting } = props;
  if (providerSwitchLabel) {
    return {
      label: `正在切换到 ${providerSwitchLabel}...`,
      description: PROVIDER_SWITCH_DESCRIPTION,
    };
  }
  if (runtimeRestarting) {
    return {
      label: RUNTIME_RESTART_LABEL,
      description: RUNTIME_RESTART_DESCRIPTION,
    };
  }
  if (!createSessionTarget) {
    return null;
  }
  return {
    label: createSessionTarget.sessionId
      ? CREATE_SESSION_CONNECTING_LABEL
      : CREATE_SESSION_STARTING_LABEL,
    description: CREATE_SESSION_DESCRIPTION,
  };
}
