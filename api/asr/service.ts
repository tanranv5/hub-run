import { randomUUID } from "node:crypto";
import { AsrServiceError } from "./errors";
import { cloneSession, isClosed, nowIso } from "./service-helpers";
import {
  clearIdleTimer,
  forwardEvent,
  getStoredSession,
  getWritableHandle,
  hasEvent,
  scheduleIdleTimeout,
  type StoredSession,
  toPositiveInteger,
  toServiceError,
} from "./service-store";
import type {
  AsrAudioEncoding,
  AsrRegistry,
  AsrService,
  AsrSessionStartInput,
} from "./types";

const DEFAULT_SAMPLE_RATE = 16_000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_ENCODING: AsrAudioEncoding = "pcm_s16le";
const DEFAULT_MAX_EVENTS_PER_SESSION = 200;
const DEFAULT_TERMINAL_SESSION_TTL_MS = 5 * 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;

interface AsrServiceOptions {
  readonly maxEventsPerSession?: number;
  readonly terminalSessionTtlMs?: number;
  readonly idleTimeoutMs?: number;
}

function normalizeStartInput(input: AsrSessionStartInput) {
  return {
    providerId: input.providerId.trim(),
    sampleRate: input.sampleRate ?? DEFAULT_SAMPLE_RATE,
    channels: input.channels ?? DEFAULT_CHANNELS,
    encoding: input.encoding ?? DEFAULT_ENCODING,
  } as const;
}


export function createAsrService(
  registry: AsrRegistry,
  options: AsrServiceOptions = {},
): AsrService {
  const sessions = new Map<string, StoredSession>();
  const maxEventsPerSession = toPositiveInteger(
    options.maxEventsPerSession,
    DEFAULT_MAX_EVENTS_PER_SESSION,
  );
  const terminalSessionTtlMs = toPositiveInteger(
    options.terminalSessionTtlMs,
    DEFAULT_TERMINAL_SESSION_TTL_MS,
  );
  const idleTimeoutMs = toPositiveInteger(
    options.idleTimeoutMs,
    DEFAULT_IDLE_TIMEOUT_MS,
  );

  return {
    listProviders() {
      return Object.values(registry)
        .map((provider) => ({ ...provider.summary }))
        .sort((left, right) => left.id.localeCompare(right.id));
    },

    async createSession(input) {
      const normalized = normalizeStartInput(input);
      const provider = registry[normalized.providerId];
      if (!provider) {
        throw new AsrServiceError(
          "ASR_PROVIDER_NOT_FOUND",
          "ASR provider not found",
          404,
        );
      }

      if (normalized.sampleRate <= 0 || normalized.channels <= 0) {
        throw new AsrServiceError(
          "ASR_INVALID_REQUEST",
          "sampleRate and channels must be positive integers",
          400,
        );
      }

      const timestamp = nowIso();
      const sessionId = randomUUID();
      const stored: StoredSession = {
        handle: null,
        events: [],
        subscribers: new Set(),
        cleanupTimer: null,
        idleTimer: null,
        session: {
          sessionId,
          providerId: normalized.providerId,
          status: "starting",
          sampleRate: normalized.sampleRate,
          channels: normalized.channels,
          encoding: normalized.encoding,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastEventId: 0,
          errorMessage: null,
        },
      };
      sessions.set(sessionId, stored);

      try {
        stored.handle = await provider.startSession(
          {
            sampleRate: normalized.sampleRate,
            channels: normalized.channels,
            encoding: normalized.encoding,
          },
          (event) => {
            forwardEvent(
              sessions,
              stored,
              event,
              maxEventsPerSession,
              terminalSessionTtlMs,
            );
          },
        );
        if (!hasEvent(stored, "session_started")) {
          forwardEvent(
            sessions,
            stored,
            { type: "session_started" },
            maxEventsPerSession,
            terminalSessionTtlMs,
          );
        }
        scheduleIdleTimeout(sessions, stored, idleTimeoutMs, maxEventsPerSession, terminalSessionTtlMs);
        return cloneSession(stored.session);
      } catch (error) {
        const serviceError = toServiceError(error, "Failed to start ASR session");
        if (!isClosed(stored.session.status)) {
          forwardEvent(
            sessions,
            stored,
            { type: "error", error: serviceError.message },
            maxEventsPerSession,
            terminalSessionTtlMs,
          );
        }
        throw serviceError;
      }
    },

    getSession(sessionId) {
      return cloneSession(getStoredSession(sessions, sessionId).session);
    },

    async appendAudio(sessionId, chunk) {
      if (chunk.byteLength === 0) {
        throw new AsrServiceError(
          "ASR_INVALID_REQUEST",
          "Audio chunk is required",
          400,
        );
      }

      const stored = getStoredSession(sessions, sessionId);
      const handle = getWritableHandle(stored);
      await handle.appendAudio(new Uint8Array(chunk));
      scheduleIdleTimeout(sessions, stored, idleTimeoutMs, maxEventsPerSession, terminalSessionTtlMs);
      return cloneSession(stored.session);
    },

    async finishSession(sessionId) {
      const stored = getStoredSession(sessions, sessionId);
      const handle = getWritableHandle(stored);
      clearIdleTimer(stored);
      stored.session = {
        ...stored.session,
        status: "finishing",
        updatedAt: nowIso(),
      };

      try {
        await handle.finish();
        return cloneSession(stored.session);
      } catch (error) {
        const serviceError = toServiceError(error, "Failed to finish ASR session");
        if (!isClosed(stored.session.status)) {
          forwardEvent(
            sessions,
            stored,
            { type: "error", error: serviceError.message },
            maxEventsPerSession,
            terminalSessionTtlMs,
          );
        }
        throw serviceError;
      }
    },

    async cancelSession(sessionId) {
      const stored = getStoredSession(sessions, sessionId);
      const handle = getWritableHandle(stored);
      clearIdleTimer(stored);

      try {
        await handle.cancel();
      } catch (error) {
        const serviceError = toServiceError(error, "Failed to cancel ASR session");
        if (!isClosed(stored.session.status)) {
          forwardEvent(
            sessions,
            stored,
            { type: "error", error: serviceError.message },
            maxEventsPerSession,
            terminalSessionTtlMs,
          );
        }
        throw serviceError;
      }

      if (!isClosed(stored.session.status)) {
        forwardEvent(
          sessions,
          stored,
          { type: "session_cancelled" },
          maxEventsPerSession,
          terminalSessionTtlMs,
        );
      }
      return cloneSession(stored.session);
    },

    readEventsAfter(sessionId, afterEventId) {
      const stored = getStoredSession(sessions, sessionId);
      return stored.events
        .filter((event) => event.eventId > afterEventId)
        .map((event) => ({ ...event }));
    },

    subscribe(sessionId, subscriber) {
      const stored = getStoredSession(sessions, sessionId);
      stored.subscribers.add(subscriber);
      return () => {
        stored.subscribers.delete(subscriber);
      };
    },
  };
}
