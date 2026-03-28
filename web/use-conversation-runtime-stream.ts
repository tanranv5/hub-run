import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  ProviderId,
  ProviderRuntimeStateSnapshot,
} from "../api/types";
import { sameThreadState, sameUserInputRequests } from "./conversation-panel-codex-runtime";
import { applyPanelRuntimeState } from "./conversation-panel-send";
import type { PanelState } from "./conversation-panel-state-types";
import { handleRealtimeStreamError } from "./realtime-auth";

const MAX_RETRY_DELAY_MS = 30_000;
const RETRY_BASE_DELAY_MS = 1_000;

export function useConversationRuntimeStream(props: {
  enabled: boolean;
  providerId: ProviderId | null;
  refreshVersion?: number;
  sessionId: string | null;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const { enabled, providerId, refreshVersion = 0, sessionId, setState } = props;

  useEffect(() => {
    if (!enabled || providerId !== "codex" || !sessionId) {
      return;
    }
    return connectRuntimeStateStream({ providerId, sessionId, setState });
  }, [enabled, providerId, refreshVersion, sessionId, setState]);
}

function connectRuntimeStateStream(props: {
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const { providerId, sessionId, setState } = props;
  let closed = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let source: EventSource | null = null;

  const connect = () => {
    if (closed) {
      return;
    }

    source?.close();
    source = new EventSource(buildRuntimeStateStreamUrl(providerId, sessionId));
    source.addEventListener("heartbeat", () => {
      retryCount = 0;
    });
    source.addEventListener("runtimeState", (event) => {
      retryCount = 0;
      applyRuntimeStateEvent(providerId, event, setState);
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
        setReconnecting: () => undefined,
      });
    };
  };

  connect();
  return () => {
    closed = true;
    if (retryTimer) {
      clearTimeout(retryTimer);
    }
    source?.close();
  };
}

function buildRuntimeStateStreamUrl(
  providerId: ProviderId,
  sessionId: string,
) {
  return `/api/providers/${providerId}/sessions/${sessionId}/state/stream`;
}

function applyRuntimeStateEvent(
  providerId: ProviderId,
  event: Event,
  setState: Dispatch<SetStateAction<PanelState>>,
) {
  const payload = JSON.parse(
    (event as MessageEvent<string>).data,
  ) as ProviderRuntimeStateSnapshot;
  const now = Date.now();
  setState((current) => {
    const runtimeUnchanged =
      sameThreadState(current.threadState, payload.threadState) &&
      sameUserInputRequests(
        current.pendingUserInputRequests,
        payload.pendingUserInputRequests,
      );
    if (runtimeUnchanged) {
      return current.error === null ? current : { ...current, error: null };
    }
    return {
      ...applyPanelRuntimeState(
        current,
        providerId,
        payload.threadState,
        payload.pendingUserInputRequests,
        now,
      ),
      error: null,
    };
  });
}

function getRetryDelay(retryCount: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, retryCount),
    MAX_RETRY_DELAY_MS,
  );
}
