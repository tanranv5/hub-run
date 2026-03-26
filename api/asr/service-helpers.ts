import type {
  AsrProviderEvent,
  AsrSession,
  AsrSessionEvent,
  AsrSessionStatus,
} from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function cloneSession(session: AsrSession): AsrSession {
  return { ...session };
}

export function cloneEvent(event: AsrSessionEvent): AsrSessionEvent {
  return { ...event };
}

export function isClosed(status: AsrSessionStatus): boolean {
  return status === "finished" || status === "cancelled" || status === "failed";
}

export function isTerminalEvent(event: AsrProviderEvent): boolean {
  return (
    event.type === "session_finished" ||
    event.type === "session_cancelled" ||
    event.type === "error"
  );
}

export function resolveStatus(
  current: AsrSessionStatus,
  event: AsrProviderEvent,
): AsrSessionStatus {
  switch (event.type) {
    case "session_started":
    case "vad_start":
    case "interim_result":
    case "final_result":
    case "heartbeat":
      return current === "starting" ? "running" : current;
    case "session_finished":
      return "finished";
    case "session_cancelled":
      return "cancelled";
    case "error":
      return "failed";
    default:
      return current;
  }
}
