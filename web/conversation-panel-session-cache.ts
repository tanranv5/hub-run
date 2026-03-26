import type { ProviderId } from "../api/types";
import type { PanelState } from "./conversation-panel-state-types";

export interface SessionPanelCacheEntry {
  draft?: string;
  skipReloadOnce?: boolean;
  state: PanelState;
}

export function createSessionPanelCacheKey(
  providerId: ProviderId,
  sessionId: string,
) {
  return `${providerId}:${sessionId}`;
}

export function readSessionPanelCache(
  cache: Map<string, SessionPanelCacheEntry>,
  providerId: ProviderId,
  sessionId: string,
) {
  return cache.get(createSessionPanelCacheKey(providerId, sessionId)) ?? null;
}

export function writeSessionPanelCache(
  cache: Map<string, SessionPanelCacheEntry>,
  providerId: ProviderId,
  sessionId: string,
  state: PanelState,
  draft: string = "",
  options: {
    skipReloadOnce?: boolean;
  } = {},
) {
  cache.set(createSessionPanelCacheKey(providerId, sessionId), {
    draft,
    skipReloadOnce: options.skipReloadOnce === true,
    state: clonePanelState(state),
  });
}

function clonePanelState(state: PanelState): PanelState {
  return {
    ...state,
    messages: [...state.messages],
    pendingUserInputRequests: [...state.pendingUserInputRequests],
    streamStatus: { ...state.streamStatus },
    summary: state.summary ? { ...state.summary } : null,
    threadState: state.threadState ? { ...state.threadState } : null,
  };
}
