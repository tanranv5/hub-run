export type RealtimeStreamPhase =
  | "idle"
  | "connecting"
  | "live"
  | "reconnecting"
  | "disconnected";

export interface RealtimeStreamStatus {
  phase: RealtimeStreamPhase;
  lastEventAt: number | null;
  retryCount: number;
}

export type RealtimeStreamScope = "sessions" | "conversation";

export const REALTIME_STREAM_STALE_AFTER_MS = 35_000;
export const REALTIME_STREAM_WATCHDOG_INTERVAL_MS = 1_000;

export function createIdleRealtimeStreamStatus(): RealtimeStreamStatus {
  return {
    phase: "idle",
    lastEventAt: null,
    retryCount: 0,
  };
}

export function createConnectingRealtimeStreamStatus(
  current: RealtimeStreamStatus,
  retryCount: number,
): RealtimeStreamStatus {
  return {
    phase: retryCount > 0 ? "reconnecting" : "connecting",
    lastEventAt: current.lastEventAt,
    retryCount,
  };
}

export function createLiveRealtimeStreamStatus(now: number): RealtimeStreamStatus {
  return {
    phase: "live",
    lastEventAt: now,
    retryCount: 0,
  };
}

export function createDisconnectedRealtimeStreamStatus(
  current: RealtimeStreamStatus,
): RealtimeStreamStatus {
  return {
    phase: "disconnected",
    lastEventAt: current.lastEventAt,
    retryCount: current.retryCount,
  };
}

export function touchRealtimeStreamActivity(
  current: RealtimeStreamStatus,
  now: number,
): RealtimeStreamStatus {
  return {
    ...current,
    lastEventAt: now,
  };
}

export function shouldDisconnectRealtimeStream(props: {
  current: RealtimeStreamStatus;
  lastActivityAt: number | null;
  now: number;
  staleAfterMs?: number;
}): boolean {
  const {
    current,
    lastActivityAt,
    now,
    staleAfterMs = REALTIME_STREAM_STALE_AFTER_MS,
  } = props;
  if (
    lastActivityAt === null ||
    current.phase === "idle" ||
    current.phase === "disconnected"
  ) {
    return false;
  }
  return now - lastActivityAt >= staleAfterMs;
}

export function getRealtimeStreamStatusLabel(
  scope: RealtimeStreamScope,
  status: RealtimeStreamStatus,
): string | null {
  if (status.phase === "idle") {
    return null;
  }

  const prefix = scope === "sessions" ? "会话列表流" : "当前会话消息流";
  switch (status.phase) {
    case "connecting":
      return `${prefix}连接中`;
    case "live":
      return `${prefix}已连接`;
    case "reconnecting":
      return `${prefix}重连中`;
    case "disconnected":
      return `${prefix}未连接`;
    case "idle":
      return null;
  }
}

export function getRealtimeStreamTone(
  status: RealtimeStreamStatus,
): "neutral" | "success" | "warning" | "danger" | null {
  switch (status.phase) {
    case "idle":
      return null;
    case "connecting":
      return "neutral";
    case "live":
      return "success";
    case "reconnecting":
      return "warning";
    case "disconnected":
      return "danger";
  }
}

const STREAM_ACTIVE_THRESHOLD_MS = 5_000;

export function isStreamActivelyDelivering(status: RealtimeStreamStatus): boolean {
  if (status.phase !== "live" || status.lastEventAt === null) {
    return false;
  }
  return Date.now() - status.lastEventAt < STREAM_ACTIVE_THRESHOLD_MS;
}
