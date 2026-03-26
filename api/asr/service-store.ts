import { AsrServiceError } from "./errors";
import {
  cloneEvent,
  isClosed,
  isTerminalEvent,
  nowIso,
  resolveStatus,
} from "./service-helpers";
import type {
  AsrProviderEvent,
  AsrProviderHandle,
  AsrSession,
  AsrSessionEvent,
  AsrSessionSubscriber,
} from "./types";

export interface StoredSession {
  session: AsrSession;
  handle: AsrProviderHandle | null;
  events: AsrSessionEvent[];
  subscribers: Set<AsrSessionSubscriber>;
  cleanupTimer: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
}

function trimEvents(events: AsrSessionEvent[], maxEventsPerSession: number) {
  if (events.length <= maxEventsPerSession) {
    return events;
  }
  return events.slice(-maxEventsPerSession);
}

function clearCleanupTimer(stored: StoredSession): void {
  if (!stored.cleanupTimer) {
    return;
  }
  clearTimeout(stored.cleanupTimer);
  stored.cleanupTimer = null;
}

export function clearIdleTimer(stored: StoredSession): void {
  if (!stored.idleTimer) {
    return;
  }
  clearTimeout(stored.idleTimer);
  stored.idleTimer = null;
}

export function scheduleIdleTimeout(
  sessions: Map<string, StoredSession>,
  stored: StoredSession,
  idleTimeoutMs: number,
  maxEventsPerSession: number,
  terminalSessionTtlMs: number,
): void {
  clearIdleTimer(stored);
  if (isClosed(stored.session.status) || idleTimeoutMs <= 0) {
    return;
  }
  const sessionId = stored.session.sessionId;
  stored.idleTimer = setTimeout(() => {
    const current = sessions.get(sessionId);
    if (current !== stored || isClosed(current.session.status)) {
      return;
    }
    if (current.handle) {
      current.handle.cancel().catch(() => undefined);
    }
    forwardEvent(
      sessions,
      current,
      { type: "error", error: "ASR session idle timeout" },
      maxEventsPerSession,
      terminalSessionTtlMs,
    );
  }, idleTimeoutMs);
  stored.idleTimer.unref?.();
}

export function toPositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function toServiceError(
  error: unknown,
  fallback: string,
): AsrServiceError {
  if (error instanceof AsrServiceError) {
    return error;
  }
  const message = error instanceof Error ? error.message : fallback;
  return new AsrServiceError("ASR_INTERNAL_ERROR", message, 500);
}

export function hasEvent(
  stored: StoredSession,
  type: AsrProviderEvent["type"],
): boolean {
  return stored.events.some((event) => event.type === type);
}

export function getStoredSession(
  sessions: Map<string, StoredSession>,
  sessionId: string,
): StoredSession {
  const stored = sessions.get(sessionId);
  if (!stored) {
    throw new AsrServiceError(
      "ASR_SESSION_NOT_FOUND",
      "ASR session not found",
      404,
    );
  }
  return stored;
}

export function getWritableHandle(stored: StoredSession): AsrProviderHandle {
  if (isClosed(stored.session.status)) {
    throw new AsrServiceError(
      "ASR_SESSION_CLOSED",
      "ASR session is closed",
      409,
    );
  }
  if (!stored.handle) {
    throw new AsrServiceError(
      "ASR_INTERNAL_ERROR",
      "ASR session handle is not ready",
      500,
    );
  }
  return stored.handle;
}

export function scheduleTerminalCleanup(
  sessions: Map<string, StoredSession>,
  stored: StoredSession,
  terminalSessionTtlMs: number,
): void {
  clearCleanupTimer(stored);
  clearIdleTimer(stored);
  if (!isClosed(stored.session.status) || terminalSessionTtlMs <= 0) {
    return;
  }

  const sessionId = stored.session.sessionId;
  stored.cleanupTimer = setTimeout(() => {
    const current = sessions.get(sessionId);
    if (current !== stored) {
      return;
    }
    current.subscribers.clear();
    current.cleanupTimer = null;
    sessions.delete(sessionId);
  }, terminalSessionTtlMs);
  stored.cleanupTimer.unref?.();
}

export function forwardEvent(
  sessions: Map<string, StoredSession>,
  stored: StoredSession,
  event: AsrProviderEvent,
  maxEventsPerSession: number,
  terminalSessionTtlMs: number,
): void {
  if (isClosed(stored.session.status)) {
    return;
  }

  const sessionEvent: AsrSessionEvent = {
    ...event,
    eventId: stored.session.lastEventId + 1,
    sessionId: stored.session.sessionId,
    providerId: stored.session.providerId,
    timestamp: nowIso(),
  };

  stored.events = trimEvents(
    [...stored.events, sessionEvent],
    maxEventsPerSession,
  );
  stored.session = {
    ...stored.session,
    status: resolveStatus(stored.session.status, event),
    updatedAt: sessionEvent.timestamp,
    lastEventId: sessionEvent.eventId,
    errorMessage:
      event.type === "error"
        ? event.error ?? "ASR session failed"
        : stored.session.errorMessage,
  };
  stored.subscribers.forEach((subscriber) => {
    subscriber(cloneEvent(sessionEvent));
  });
  if (isTerminalEvent(event)) {
    scheduleTerminalCleanup(sessions, stored, terminalSessionTtlMs);
  }
}
