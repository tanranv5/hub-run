import type { Dispatch, SetStateAction } from "react";
import type { ProviderId } from "../api/types";
import { getConversationPage } from "./api";
import { getCodexSendStatus, loadRuntimeState } from "./conversation-panel-codex-runtime";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
} from "./conversation-panel-state-types";
import { getErrorMessage } from "./utils";

export { getErrorMessage };

const PAGE_SIZE = 10;

type ConversationPageLoader = typeof getConversationPage;

function applyOlderPage(
  current: PanelState,
  page: Awaited<ReturnType<ConversationPageLoader>>,
  loadingOlder: boolean,
): PanelState {
  return {
    ...current,
    messages: [...page.messages, ...current.messages],
    nextBefore: page.nextBefore,
    loadingOlder,
  };
}

export async function loadInitialPage(
  providerId: ProviderId,
  sessionId: string,
): Promise<PanelState> {
  const [page, runtime] = await Promise.all([
    getConversationPage(providerId, sessionId, null, PAGE_SIZE),
    loadRuntimeState(providerId, sessionId),
  ]);

  return {
    ...INITIAL_PANEL_STATE,
    messages: page.messages,
    nextBefore: page.nextBefore,
    summary: page.summary,
    sending: runtime.threadState?.isGenerating ?? false,
    sendStatus: getCodexSendStatus(
      runtime.threadState,
      runtime.pendingUserInputRequests,
      false,
      null,
    ),
    threadState: runtime.threadState,
    pendingUserInputRequests: runtime.pendingUserInputRequests,
  };
}

export async function loadConversationWindow(
  providerId: ProviderId,
  sessionId: string,
) {
  const page = await getConversationPage(providerId, sessionId, null, PAGE_SIZE);
  return {
    messages: page.messages,
    nextBefore: page.nextBefore,
    summary: page.summary,
  };
}

export async function loadOlderMessages(props: {
  nextBefore: string;
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const { nextBefore, providerId, sessionId, setState } = props;
  setState((current) => ({ ...current, loadingOlder: true, error: null }));

  try {
    const page = await getConversationPage(providerId, sessionId, nextBefore, PAGE_SIZE);
    setState((current) => applyOlderPage(current, page, false));
  } catch (cause) {
    setState((current) => ({
      ...current,
      loadingOlder: false,
      error: getErrorMessage(cause, "Failed to load older messages"),
    }));
  }
}

export async function loadOlderMessagesUntilStart(props: {
  loadPage?: ConversationPageLoader;
  nextBefore: string;
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const {
    loadPage = getConversationPage,
    nextBefore,
    providerId,
    sessionId,
    setState,
  } = props;
  setState((current) => ({ ...current, loadingOlder: true, error: null }));

  try {
    let cursor: string | null = nextBefore;
    while (cursor) {
      const page = await loadPage(providerId, sessionId, cursor, PAGE_SIZE);
      cursor = page.nextBefore;
      setState((current) => applyOlderPage(current, page, cursor !== null));
    }
  } catch (cause) {
    setState((current) => ({
      ...current,
      loadingOlder: false,
      error: getErrorMessage(cause, "Failed to load older messages"),
    }));
  }
}
