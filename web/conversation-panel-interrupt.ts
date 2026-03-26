import type { Dispatch, SetStateAction } from "react";
import type { ProviderId } from "../api/types";
import { interruptProviderSession } from "./api";
import { getErrorMessage, loadInitialPage } from "./conversation-panel-state-ops";
import { mergePolledPanelState } from "./conversation-panel-poll-state";
import type { PanelState } from "./conversation-panel-state-types";

export async function interruptConversationTurn(props: {
  interruptSession?: typeof interruptProviderSession;
  loadPage?: typeof loadInitialPage;
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
  shouldAbort?: () => boolean;
}) {
  const {
    interruptSession = interruptProviderSession,
    loadPage = loadInitialPage,
    providerId,
    sessionId,
    setState,
    shouldAbort = () => false,
  } = props;
  setState((current) => ({
    ...current,
    interrupting: true,
    sendStatus: "正在中断当前回合...",
    error: null,
  }));

  try {
    await interruptSession(providerId, sessionId);
    if (shouldAbort()) {
      return;
    }
    const nextState = await loadPage(providerId, sessionId);
    if (shouldAbort()) {
      return;
    }
    setState((current) =>
      mergePolledPanelState({
        current,
        nextState,
        now: Date.now(),
        providerId,
      }),
    );
  } catch (cause) {
    if (shouldAbort()) {
      return;
    }
    setState((current) => ({
      ...current,
      interrupting: false,
      error: getErrorMessage(cause, "Failed to interrupt current turn"),
    }));
  }
}
