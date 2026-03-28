import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  ProviderConversationStreamChunk,
  ProviderConversationStreamSnapshot,
  ProviderId,
} from "../api/types";
import {
  applyConversationDelta,
  applyConversationSnapshot,
  buildConversationStreamUrl,
} from "./conversation-stream-state";
import { syncPanelSendLifecycle } from "./conversation-panel-send";
import type { PanelState } from "./conversation-panel-state-types";
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
const STREAM_PAGE_SIZE = 10;

export function useConversationStream(props: {
  enabled: boolean;
  providerId: ProviderId | null;
  refreshVersion?: number;
  sessionId: string | null;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const { enabled, providerId, refreshVersion = 0, sessionId, setState } = props;
  const offsetRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef<number | null>(null);

  useEffect(() => {
    offsetRef.current = null;
    lastActivityAtRef.current = null;
  }, [providerId, refreshVersion, sessionId]);

  useEffect(() => {
    if (!enabled || !providerId || !sessionId) {
      setState((current) => ({
        ...current,
        streamStatus: createIdleRealtimeStreamStatus(),
      }));
      return;
    }

    return connectConversationStream({
      providerId,
      readLastActivity: () => lastActivityAtRef.current,
      readOffset: () => offsetRef.current,
      sessionId,
      setLastActivity: (nextActivityAt) => {
        lastActivityAtRef.current = nextActivityAt;
      },
      setOffset: (nextOffset) => {
        offsetRef.current = nextOffset;
      },
      setState,
    });
  }, [enabled, providerId, refreshVersion, sessionId, setState]);
}

function connectConversationStream(props: {
  providerId: ProviderId;
  readLastActivity: () => number | null;
  readOffset: () => number | null;
  sessionId: string;
  setLastActivity: (nextActivityAt: number) => void;
  setOffset: (nextOffset: number) => void;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const {
    providerId,
    readLastActivity,
    readOffset,
    sessionId,
    setLastActivity,
    setOffset,
    setState,
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
    setState((current) => ({
      ...current,
      streamStatus: createConnectingRealtimeStreamStatus(
        current.streamStatus,
        retryCount,
      ),
    }));
    source?.close();
    source = new EventSource(
      buildConversationStreamUrl(
        providerId,
        sessionId,
        STREAM_PAGE_SIZE,
        readOffset(),
      ),
    );
    source.addEventListener("heartbeat", () => {
      const now = Date.now();
      retryCount = 0;
      setLastActivity(now);
      setState((current) => ({
        ...current,
        streamStatus: createLiveRealtimeStreamStatus(now),
      }));
    });
    source.addEventListener("conversation", (event) => {
      const now = Date.now();
      retryCount = 0;
      setLastActivity(now);
      const payload = JSON.parse(event.data) as ProviderConversationStreamSnapshot;
      setOffset(payload.nextOffset);
      setState((current) => {
        const nextState = applyConversationSnapshot(current, payload);
        const synced = syncPanelSendLifecycle(
          current,
          providerId,
          nextState.messages,
          now,
        );
        return {
          ...nextState,
          sendLifecycle: synced.sendLifecycle,
          sending: synced.sending,
          sendStatus: synced.sendStatus,
        };
      });
    });
    source.addEventListener("messages", (event) => {
      const now = Date.now();
      retryCount = 0;
      setLastActivity(now);
      const payload = JSON.parse(event.data) as ProviderConversationStreamChunk;
      setOffset(payload.nextOffset);
      setState((current) => {
        const nextState = applyConversationDelta(current, payload);
        const synced = syncPanelSendLifecycle(
          current,
          providerId,
          nextState.messages,
          now,
        );
        return {
          ...nextState,
          sendLifecycle: synced.sendLifecycle,
          sending: synced.sending,
          sendStatus: synced.sendStatus,
        };
      });
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
          setState((current) => ({
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
    setState((current) => {
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
