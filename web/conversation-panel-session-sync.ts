import type { ProviderId } from "../api/types";
import {
  readSessionPanelCache,
  writeSessionPanelCache,
  type SessionPanelCacheEntry,
} from "./conversation-panel-session-cache";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
} from "./conversation-panel-state-types";

export interface DetachedSessionUpdate {
  draft?: string;
  sessionId?: string;
  updateState?: (current: PanelState) => PanelState;
}

export function applySessionPanelUpdate(props: {
  activeProviderId: ProviderId | null;
  activeSessionId: string | null;
  cache: Map<string, SessionPanelCacheEntry>;
  currentDraft: string;
  currentState: PanelState;
  providerId: ProviderId;
  sessionId: string;
  update: DetachedSessionUpdate;
}) {
  const {
    activeProviderId,
    activeSessionId,
    cache,
    currentDraft,
    currentState,
    providerId,
    sessionId,
    update,
  } = props;
  const targetSessionId = update.sessionId ?? sessionId;
  const isActive =
    activeProviderId === providerId && activeSessionId === targetSessionId;
  const cached = isActive
    ? null
    : readSessionPanelCache(cache, providerId, targetSessionId);
  const baseDraft = isActive ? currentDraft : cached?.draft ?? "";
  const baseState = isActive ? currentState : cached?.state ?? INITIAL_PANEL_STATE;
  const nextState = update.updateState ? update.updateState(baseState) : baseState;
  const nextDraft = update.draft ?? baseDraft;

  writeSessionPanelCache(
    cache,
    providerId,
    targetSessionId,
    nextState,
    nextDraft,
  );
  return {
    isActive,
    nextDraft,
    nextState,
  };
}
