import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  ProviderSessionsStreamUpdate,
  ProviderSummary,
  SessionsPage,
} from "../api/types";
import type { BrowserState } from "./browser-state";
import {
  applySessionsSnapshot,
  applySessionsUpdate,
  buildSessionsStreamUrl,
} from "./browser-realtime";
import {
  createConnectingRealtimeStreamStatus,
  createDisconnectedRealtimeStreamStatus,
  createIdleRealtimeStreamStatus,
  createLiveRealtimeStreamStatus,
  REALTIME_STREAM_WATCHDOG_INTERVAL_MS,
  shouldDisconnectRealtimeStream,
} from "./realtime-stream-status";
import { handleRealtimeStreamError } from "./realtime-auth";

const MAX_RETRY_DELAY_MS = 30_000;
const RETRY_BASE_DELAY_MS = 1_000;

export function useProviderSessionsStream(props: {
  browser: BrowserState;
  project: string | null;
  provider: ProviderSummary | null;
  refreshVersion?: number;
  setBrowser: Dispatch<SetStateAction<BrowserState>>;
}) {
  const { browser, project, provider, refreshVersion = 0, setBrowser } = props;
  const streamState = readSessionsStreamState(browser);

  useEffect(() => {
    if (!shouldConnectSessionsStream(browser, provider)) {
      setBrowser((current) => ({
        ...current,
        streamStatus: createIdleRealtimeStreamStatus(),
      }));
      return;
    }

    let lastActivityAt: number | null = null;
    return connectSessionsStream({
      loaded: streamState.loaded,
      project,
      provider,
      readLastActivity: () => lastActivityAt,
      setLastActivity: (nextActivityAt) => {
        lastActivityAt = nextActivityAt;
      },
      setBrowser,
    });
  }, [
    browser.loading,
    project,
    provider,
    refreshVersion,
    setBrowser,
    streamState.hasDraftSession,
    streamState.loaded,
  ]);
}

export function shouldConnectSessionsStream(
  browser: BrowserState,
  provider: ProviderSummary | null,
) {
  const streamState = readSessionsStreamState(browser);
  return Boolean(
    provider?.capabilities.stream &&
      !browser.loading &&
      !streamState.hasDraftSession,
  );
}

export function readSessionsStreamState(browser: BrowserState) {
  return {
    loaded: resolveLoadedSessionsCount(browser),
    hasDraftSession: browser.sessions.some((session) => session.isDraft),
  };
}

function resolveLoadedSessionsCount(browser: BrowserState) {
  if (browser.nextBefore) {
    const parsed = Number.parseInt(browser.nextBefore, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (
    typeof browser.totalSessionCount === "number" &&
    Number.isFinite(browser.totalSessionCount) &&
    browser.totalSessionCount > 0
  ) {
    return browser.totalSessionCount;
  }
  return Math.max(1, browser.sessions.length);
}

function connectSessionsStream(props: {
  loaded: number;
  project: string | null;
  provider: ProviderSummary;
  readLastActivity: () => number | null;
  setLastActivity: (nextActivityAt: number) => void;
  setBrowser: Dispatch<SetStateAction<BrowserState>>;
}) {
  const {
    loaded,
    project,
    provider,
    readLastActivity,
    setBrowser,
    setLastActivity,
  } = props;
  let closed = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let source: EventSource | null = null;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;

  const connect = () => {
    if (closed) {
      return;
    }

    setLastActivity(Date.now());
    setBrowser((current) => ({
      ...current,
      streamStatus: createConnectingRealtimeStreamStatus(
        current.streamStatus,
        retryCount,
      ),
    }));
    source?.close();
    source = new EventSource(buildSessionsStreamUrl(provider.id, loaded, project));
    source.addEventListener("heartbeat", () => {
      const now = Date.now();
      retryCount = 0;
      setLastActivity(now);
      setBrowser((current) => ({
        ...current,
        streamStatus: createLiveRealtimeStreamStatus(now),
      }));
    });
    source.addEventListener("sessions", (event) => {
      retryCount = 0;
      setLastActivity(Date.now());
      setBrowser((current) =>
        applySessionsSnapshot(
          current,
          JSON.parse(event.data) as SessionsPage,
          project,
        )
      );
    });
    source.addEventListener("sessionsUpdate", (event) => {
      retryCount = 0;
      setLastActivity(Date.now());
      setBrowser((current) =>
        applySessionsUpdate(
          current,
          JSON.parse(event.data) as ProviderSessionsStreamUpdate,
        )
      );
    });
    source.onerror = () => {
      source?.close();
      void handleRealtimeStreamError({
        isClosed: () => closed,
        retryCount,
        getRetryDelay,
        scheduleReconnect: (delay) => {
          retryTimer = setTimeout(connect, delay);
          retryCount += 1;
        },
        setReconnecting: () => {
          setBrowser((current) => ({
            ...current,
            streamStatus: createConnectingRealtimeStreamStatus(
              current.streamStatus,
              retryCount + 1,
            ),
          }));
        },
      });
    };
  };

  connect();
  watchdogTimer = setInterval(() => {
    const now = Date.now();
    setBrowser((current) => {
      if (
        !shouldDisconnectRealtimeStream({
          current: current.streamStatus,
          lastActivityAt: readLastActivity(),
          now,
        })
      ) {
        return current;
      }
      return {
        ...current,
        streamStatus: createDisconnectedRealtimeStreamStatus(
          current.streamStatus,
        ),
      };
    });
  }, REALTIME_STREAM_WATCHDOG_INTERVAL_MS);
  return () => {
    closed = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
    }
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
    }
    source?.close();
  };
}

function getRetryDelay(retryCount: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, retryCount),
    MAX_RETRY_DELAY_MS,
  );
}
