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

function isSameSession(
  previousSession: SessionIdentity,
  providerId: ProviderId | null,
  sessionId: string | null,
) {
  return previousSession.providerId === providerId && previousSession.sessionId === sessionId;
}

function persistPreviousSessionSnapshot(props: {
  draft: string;
  nextProviderId: ProviderId | null;
  nextSessionId: string | null;
  previousSession: SessionIdentity | null;
  sessionCache: Map<string, SessionPanelCacheEntry>;
  state: PanelState;
}) {
  const {
    draft,
    nextProviderId,
    nextSessionId,
    previousSession,
    sessionCache,
    state,
  } = props;
  if (!previousSession) {
    return;
  }

  const preservingPreloadedState =
    isSameSession(previousSession, nextProviderId, nextSessionId) &&
    readSessionPanelCache(
      sessionCache,
      previousSession.providerId,
      previousSession.sessionId,
    )?.skipReloadOnce;
  const nextState = preservingPreloadedState
    ? readSessionPanelCache(
        sessionCache,
        previousSession.providerId,
        previousSession.sessionId,
      )?.state ?? state
    : state;

  writeSessionPanelCache(
    sessionCache,
    previousSession.providerId,
    previousSession.sessionId,
    nextState,
    draft,
    {
      skipReloadOnce: preservingPreloadedState,
    },
  );
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
  persistPreviousSessionSnapshot({
    draft: draftRef?.current ?? "",
    nextProviderId: providerId,
    nextSessionId: session?.id ?? null,
    previousSession,
    sessionCache: sessionCacheRef.current,
    state: stateRef.current,
  });

  generationRef.current += 1;
  const generation = generationRef.current;
  if (!providerId || !session) {
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
  if (isDraftSession(session)) {
    setState(cached?.state ?? INITIAL_PANEL_STATE);
    return;
  }
  setState(
    cached ? cached.state : (current) => ({ ...current, ...INITIAL_PANEL_STATE, loading: true }),
  );
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
