import type { Dispatch, SetStateAction } from "react";
import type {
  ConversationMessage,
  ProviderId,
  SessionSummary,
} from "../api/types";
import {
  appendImmediateAssistantMessage,
  appendOptimisticUserMessage,
} from "./conversation-panel-state-helpers";
import {
  acceptPanelSendLifecycle,
  beginPanelSendLifecycle,
  syncPanelSendLifecycle,
  timeoutPanelSendLifecycle,
} from "./conversation-panel-send";
import { isDraftSession } from "./draft-session";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
  type SendConversationResult,
} from "./conversation-panel-state-types";
import type { DetachedSessionUpdate } from "./conversation-panel-session-sync";
import { getErrorMessage, loadInitialPage } from "./conversation-panel-state-ops";
import { hasConversationChanged } from "./conversation-panel-state-helpers";
import { getProviderThreadState } from "./api";

const POST_SEND_REFRESH_ATTEMPTS = 8;
const POST_SEND_REFRESH_INTERVAL_MS = 1_000;

export async function sendConversation(props: {
  draft: string;
  onMessageSent: (sessionId: string) => Promise<void>;
  onSendMessage: (text: string) => Promise<SendConversationResult>;
  providerId: ProviderId;
  session: SessionSummary;
  streamAvailable: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  setState: Dispatch<SetStateAction<PanelState>>;
  shouldAbort: () => boolean;
  updateDetachedSession?: (update: DetachedSessionUpdate) => void;
}) {
  const text = props.draft.trim();
  if (!text) {
    return;
  }

  const baselineMessages = setPendingUserMessage(
    props.setState,
    props.providerId,
    props.session.id,
    text,
    Date.now(),
  );
  clearSubmittedDraft(props.setDraft);

  let result: SendConversationResult;
  try {
    result = await props.onSendMessage(text);
  } catch (cause) {
    if (props.shouldAbort()) {
      restoreDetachedFailedSend(props.updateDetachedSession, baselineMessages, text, cause);
      return;
    }
    if (props.providerId === "codex" && !isDraftSession(props.session)) {
      const reconciled = await reconcileCodexSendFailure(
        props.providerId,
        props.session.id,
        baselineMessages,
      );
      if (reconciled) {
        props.setState((current) => ({
          ...current,
          messages: reconciled.messages,
          sending: reconciled.isGenerating,
          sendLifecycle: null,
          sendStatus: null,
          error: null,
        }));
        return;
      }
    }
    restoreFailedSend(props.setDraft, props.setState, baselineMessages, text, cause);
    return;
  }

  if (props.shouldAbort()) {
    persistDetachedAcceptedSend(props, result);
    return;
  }

  applyAcceptedSendResult(props, result);
  try {
    if (await redirectDraftSessionIfNeeded(props, result, baselineMessages, text)) {
      return;
    }
    await finishSendResult(props, result, baselineMessages);
  } catch (cause) {
    if (props.shouldAbort()) {
      return;
    }
    preserveAcceptedSend(props.providerId, props.setState, cause);
  }
}

function applyAcceptedSendResult(
  props: Pick<
    Parameters<typeof sendConversation>[0],
    "providerId" | "setState"
  >,
  result: SendConversationResult,
) {
  props.setState((current) =>
    acceptPanelSendLifecycle(
      current,
      props.providerId,
      result.sessionId,
      result.turnId,
      Date.now(),
    )
  );
}

async function redirectDraftSessionIfNeeded(
  props: Pick<
    Parameters<typeof sendConversation>[0],
    "onMessageSent" | "providerId" | "session" | "updateDetachedSession"
  >,
  result: SendConversationResult,
  baselineMessages: ConversationMessage[],
  text: string,
) {
  if (!isDraftSession(props.session) || result.sessionId === props.session.id) {
    return false;
  }
  persistDraftAcceptedSession(props, result, baselineMessages, text);
  await props.onMessageSent(result.sessionId);
  return true;
}

function persistDraftAcceptedSession(
  props: Pick<
    Parameters<typeof sendConversation>[0],
    "providerId" | "updateDetachedSession"
  >,
  result: SendConversationResult,
  baselineMessages: ConversationMessage[],
  text: string,
) {
  if (!props.updateDetachedSession) {
    return;
  }

  const acceptedAt = Date.now();
  const pendingMessages = appendOptimisticUserMessage(
    baselineMessages,
    text,
    acceptedAt,
  );
  const submittedState = beginPanelSendLifecycle(
    {
      ...INITIAL_PANEL_STATE,
      messages: pendingMessages,
      error: null,
    },
    props.providerId,
    result.sessionId,
    acceptedAt,
  );
  const acceptedState = acceptPanelSendLifecycle(
    submittedState,
    props.providerId,
    result.sessionId,
    result.turnId,
    acceptedAt,
  );
  const immediateOutput = result.outputText?.trim();
  props.updateDetachedSession({
    sessionId: result.sessionId,
    updateState: () => {
      if (!immediateOutput) {
        return acceptedState;
      }
      const nextMessages = appendImmediateAssistantMessage(
        acceptedState.messages,
        immediateOutput,
        acceptedAt,
      );
      const synced = syncPanelSendLifecycle(
        acceptedState,
        props.providerId,
        nextMessages,
        acceptedAt,
      );
      return {
        ...synced,
        messages: nextMessages,
        sendLifecycle: synced.sendLifecycle,
        sending: synced.sending,
        sendStatus: synced.sendStatus,
      };
    },
  });
}

async function finishSendResult(
  props: Parameters<typeof sendConversation>[0],
  result: SendConversationResult,
  baselineMessages: ConversationMessage[],
) {
  const sidebarRefresh = props.onMessageSent(result.sessionId);
  if (props.providerId === "codex") {
    await syncCodexSendResult(props, result);
    await sidebarRefresh;
    return;
  }

  await refreshConversationAfterSend({
    baselineMessages,
    outputText: result.outputText,
    providerId: props.providerId,
    sessionId: result.sessionId,
    setState: props.setState,
    shouldAbort: props.shouldAbort,
  });
  await sidebarRefresh;
}

async function syncCodexSendResult(
  props: Pick<
    Parameters<typeof sendConversation>[0],
    "providerId" | "setState" | "shouldAbort" | "streamAvailable"
  >,
  result: SendConversationResult,
) {
  if (props.streamAvailable) {
    return;
  }

  const nextState = await loadInitialPage(
    props.providerId,
    result.sessionId,
  );
  if (props.shouldAbort()) {
    return;
  }

  props.setState((current) => ({
    ...current,
    ...nextState,
    sendLifecycle: current.sendLifecycle,
    sending: current.sending,
    sendStatus: current.sendStatus,
  }));
}

async function refreshConversationAfterSend(props: {
  baselineMessages: ConversationMessage[];
  outputText: string | null;
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
  shouldAbort: () => boolean;
}) {
  const { baselineMessages, outputText, providerId, sessionId, setState, shouldAbort } = props;
  const immediateOutput = outputText?.trim();
  if (immediateOutput) {
    setState((current) => {
      const nextMessages = appendImmediateAssistantMessage(current.messages, immediateOutput);
      const synced = syncPanelSendLifecycle(current, providerId, nextMessages, Date.now());
      return {
        ...current,
        messages: nextMessages,
        sendLifecycle: synced.sendLifecycle,
        sending: synced.sending,
        sendStatus: synced.sendStatus,
      };
    });
    return;
  }

  for (let attempt = 0; attempt < POST_SEND_REFRESH_ATTEMPTS; attempt += 1) {
    if (shouldAbort()) {
      return;
    }

    const nextState = await loadInitialPage(providerId, sessionId);
    if (shouldAbort()) {
      return;
    }
    if (!hasConversationChanged(baselineMessages, nextState.messages)) {
      if (attempt < POST_SEND_REFRESH_ATTEMPTS - 1) {
        await wait(POST_SEND_REFRESH_INTERVAL_MS);
      }
      continue;
    }

    setState((current) => {
      const synced = syncPanelSendLifecycle(
        current,
        providerId,
        nextState.messages,
        Date.now(),
      );
      return {
        ...synced,
        ...nextState,
        sendLifecycle: synced.sendLifecycle,
        sending: synced.sending,
        sendStatus: synced.sendStatus,
      };
    });
    return;
  }

  if (!shouldAbort()) {
    setState((current) =>
      timeoutPanelSendLifecycle(current, providerId, Date.now())
    );
  }
}

function setPendingUserMessage(
  setState: Dispatch<SetStateAction<PanelState>>,
  providerId: ProviderId,
  sessionId: string,
  text: string,
  now: number,
): ConversationMessage[] {
  let baselineMessages: ConversationMessage[] = [];
  setState((current) => {
    baselineMessages = current.messages;
    return beginPanelSendLifecycle(
      {
        ...current,
        messages: appendOptimisticUserMessage(current.messages, text),
        error: null,
      },
      providerId,
      sessionId,
      now,
    );
  });
  return baselineMessages;
}

function clearSubmittedDraft(setDraft: Dispatch<SetStateAction<string>>) {
  setDraft("");
}

function restoreFailedSend(
  setDraft: Dispatch<SetStateAction<string>>,
  setState: Dispatch<SetStateAction<PanelState>>,
  baselineMessages: ConversationMessage[],
  text: string,
  cause: unknown,
) {
  setDraft(text);
  setState(buildFailedSendState(baselineMessages, cause));
}

function buildFailedSendState(
  baselineMessages: ConversationMessage[],
  cause: unknown,
) {
  return (current: PanelState): PanelState => ({
    ...current,
    messages: baselineMessages,
    sending: false,
    sendStatus: null,
    sendLifecycle: null,
    error: getErrorMessage(cause, "Failed to send message"),
  });
}

function restoreDetachedFailedSend(
  updateDetachedSession: ((update: DetachedSessionUpdate) => void) | undefined,
  baselineMessages: ConversationMessage[],
  text: string,
  cause: unknown,
) {
  if (!updateDetachedSession) {
    return;
  }
  updateDetachedSession({
    draft: text,
    updateState: buildFailedSendState(baselineMessages, cause),
  });
}

function persistDetachedAcceptedSend(
  props: Pick<
    Parameters<typeof sendConversation>[0],
    "providerId" | "session" | "updateDetachedSession"
  >,
  result: SendConversationResult,
) {
  if (!props.updateDetachedSession) {
    return;
  }
  props.updateDetachedSession({
    updateState: (current) =>
      acceptPanelSendLifecycle(
        current,
        props.providerId,
        result.sessionId || props.session.id,
        result.turnId,
        Date.now(),
      ),
  });
}

function preserveAcceptedSend(
  providerId: ProviderId,
  setState: Dispatch<SetStateAction<PanelState>>,
  cause: unknown,
) {
  setState((current) => ({
    ...(providerId === "codex"
      ? current
      : timeoutPanelSendLifecycle(current, providerId, Date.now())),
    error: getErrorMessage(cause, "Message was accepted but failed to sync"),
  }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function reconcileCodexSendFailure(
  providerId: ProviderId,
  sessionId: string,
  baselineMessages: ConversationMessage[],
): Promise<{ messages: ConversationMessage[]; isGenerating: boolean } | null> {
  try {
    const [threadState, page] = await Promise.all([
      getProviderThreadState(providerId, sessionId, null),
      loadInitialPage(providerId, sessionId),
    ]);
    if (hasConversationChanged(baselineMessages, page.messages)) {
      return { messages: page.messages, isGenerating: threadState.isGenerating };
    }
  } catch {
    // reconciliation failed — fall through to normal failure handling
  }
  return null;
}
