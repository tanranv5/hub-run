import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ProviderId, SessionSummary } from "../api/types";
import { isDraftSession } from "./draft-session";
import {
  getErrorMessage,
  loadInitialPage,
} from "./conversation-panel-state-ops";
import { mergePolledPanelState } from "./conversation-panel-poll-state";
import {
  readSessionPanelCache,
  writeSessionPanelCache,
  type SessionPanelCacheEntry,
} from "./conversation-panel-session-cache";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
} from "./conversation-panel-state-types";

export interface SessionIdentity {
  providerId: ProviderId;
  sessionId: string;
}

export function bootstrapConversationPanel(props: {
  draftRef?: MutableRefObject<string>;
  generationRef: MutableRefObject<number>;
  loadPage?: typeof loadInitialPage;
  previousSessionRef: MutableRefObject<SessionIdentity | null>;
  providerId: ProviderId | null;
  session: SessionSummary | null;
  sessionCacheRef: MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  setDraft?: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<PanelState>>;
  stateRef: MutableRefObject<PanelState>;
}) {
  const {
    draftRef,
    generationRef,
    loadPage = loadInitialPage,
    previousSessionRef,
    providerId,
    session,
    sessionCacheRef,
    setDraft,
    setState,
    stateRef,
  } = props;
  const previousSession = previousSessionRef.current;
  if (previousSession) {
    writeSessionPanelCache(
      sessionCacheRef.current,
      previousSession.providerId,
      previousSession.sessionId,
      stateRef.current,
      draftRef?.current ?? "",
    );
  }

  generationRef.current += 1;
  const generation = generationRef.current;
  if (!providerId || !session || isDraftSession(session)) {
    previousSessionRef.current = null;
    setDraft?.("");
    setState(INITIAL_PANEL_STATE);
    return;
  }

  previousSessionRef.current = { providerId, sessionId: session.id };
  const cached = readSessionPanelCache(
    sessionCacheRef.current,
    providerId,
    session.id,
  );
  setDraft?.(cached?.draft ?? "");
  setState(cached ? cached.state : (current) => ({ ...current, ...INITIAL_PANEL_STATE, loading: true }));
  if (cached?.skipReloadOnce) {
    writeSessionPanelCache(
      sessionCacheRef.current,
      providerId,
      session.id,
      cached.state,
      cached.draft ?? "",
    );
    return;
  }

  loadPage(providerId, session.id)
    .then((nextState) => {
      if (generation === generationRef.current) {
        setState((current) =>
          mergePolledPanelState({
            current,
            nextState,
            now: Date.now(),
            providerId,
          })
        );
      }
    })
    .catch((cause) => {
      if (generation === generationRef.current) {
        setState({
          ...INITIAL_PANEL_STATE,
          error: getErrorMessage(cause, "Failed to load conversation"),
        });
      }
    });
}
