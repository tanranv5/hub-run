import type { Dispatch, SetStateAction } from "react";
import type { ConversationSearchMode, ProviderId } from "../api/types";
import { getConversationPage } from "./api";
import { getCodexSendStatus, loadRuntimeState } from "./conversation-panel-codex-runtime";
import { appendMissingRuntimeTerminalStatusMessage } from "./conversation-panel-send";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
} from "./conversation-panel-state-types";
import { getErrorMessage } from "./utils";

export { getErrorMessage };

const PAGE_SIZE = 10;

type ConversationPageLoader = typeof getConversationPage;

function mergeConversationPages(
  olderMessages: PanelState["messages"],
  currentMessages: PanelState["messages"],
) {
  const seenIds = new Set<string>();
  return [...olderMessages, ...currentMessages].filter((message) => {
    if (seenIds.has(message.id)) {
      return false;
    }
    seenIds.add(message.id);
    return true;
  });
}

function applyOlderPage(
  current: PanelState,
  page: Awaited<ReturnType<ConversationPageLoader>>,
  loadingOlder: boolean,
): PanelState {
  return {
    ...current,
    messages: mergeConversationPages(page.messages, current.messages),
    nextBefore: page.nextBefore,
    loadingOlder,
  };
}

export async function loadInitialPage(
  providerId: ProviderId,
  sessionId: string,
  deps: {
    getPage?: typeof getConversationPage;
    loadRuntime?: typeof loadRuntimeState;
    mode?: ConversationSearchMode;
    now?: () => number;
  } = {},
): Promise<PanelState> {
  const {
    getPage = getConversationPage,
    loadRuntime = loadRuntimeState,
    mode,
    now = () => Date.now(),
  } = deps;
  const [page, runtime] = await Promise.all([
    getPage(providerId, sessionId, null, PAGE_SIZE, mode),
    loadRuntime(providerId, sessionId),
  ]);
  const messages = appendMissingRuntimeTerminalStatusMessage(
    page.messages,
    providerId,
    runtime.threadState,
    now(),
  );

  return {
    ...INITIAL_PANEL_STATE,
    messages,
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
  mode?: ConversationSearchMode,
) {
  const page = await getConversationPage(providerId, sessionId, null, PAGE_SIZE, mode);
  return {
    messages: page.messages,
    nextBefore: page.nextBefore,
    summary: page.summary,
  };
}

export async function loadOlderMessages(props: {
  mode?: ConversationSearchMode;
  nextBefore: string;
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const { mode, nextBefore, providerId, sessionId, setState } = props;
  setState((current) => ({ ...current, loadingOlder: true, error: null }));

  try {
    const page = await getConversationPage(providerId, sessionId, nextBefore, PAGE_SIZE, mode);
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
  mode?: ConversationSearchMode;
  nextBefore: string;
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
}) {
  const {
    loadPage = getConversationPage,
    mode,
    nextBefore,
    providerId,
    sessionId,
    setState,
  } = props;
  setState((current) => ({ ...current, loadingOlder: true, error: null }));

  try {
    let cursor: string | null = nextBefore;
    while (cursor) {
      const page = await loadPage(providerId, sessionId, cursor, PAGE_SIZE, mode);
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
