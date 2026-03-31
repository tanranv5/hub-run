import type { Dispatch, SetStateAction } from "react";
import type { ConversationMessage, ProviderId } from "../api/types";
import { sanitizeConversationText } from "../api/providers/display-text";
import {
  sameThreadState,
  sameUserInputRequests,
} from "./conversation-panel-codex-runtime";
import { applyPanelRuntimeState } from "./conversation-panel-send";
import { isSendLifecycleActive } from "./conversation-send-state";
import {
  loadConversationWindow,
  loadInitialPage,
} from "./conversation-panel-state-ops";
import {
  hasConversationChanged,
  isLocalTerminalStatusMessage,
  isOptimisticUserMessage,
  stripRedundantLocalTerminalStatusMessages,
} from "./conversation-panel-state-helpers";
import type {
  BufferedConversationWindow,
  PanelState,
} from "./conversation-panel-state-types";
import { INITIAL_PANEL_STATE } from "./conversation-panel-state-types";

function normalizeUserMessageText(text: string): string {
  return sanitizeConversationText(text);
}

export const PANEL_REFRESH_INTERVAL_MS = 1_200;
const STALE_STREAM_ACTIVITY_MS = PANEL_REFRESH_INTERVAL_MS;

export function mergePolledPanelState(props: {
  current: PanelState;
  nextState: PanelState;
  now: number;
  providerId: ProviderId;
}): PanelState {
  const { current, nextState, now, providerId } = props;

  if (
    current.streamOffset !== null &&
    nextState.streamOffset !== null &&
    current.streamOffset > nextState.streamOffset
  ) {
    return current;
  }

  const nextInterrupting =
    current.interrupting && nextState.threadState?.isGenerating === true;
  const runtimeMerged = applyPanelRuntimeState(
    nextInterrupting === current.interrupting
      ? current
      : {
          ...current,
          interrupting: nextInterrupting,
        },
    providerId,
    nextState.threadState,
    nextState.pendingUserInputRequests,
    now,
  );
  const nextMessages = mergeTerminalStatusMessages(
    resolvePolledMessages(current, nextState),
    runtimeMerged.messages,
  );
  const nextBufferedWindow = buildBufferedConversationWindow(nextMessages, nextState);
  const conversationChanged = hasConversationChanged(current.messages, nextMessages);
  if (isPollStateUnchanged(current, nextState, runtimeMerged, conversationChanged)) {
    return current;
  }

  return {
    ...runtimeMerged,
    messages: current.messageWindowFrozen ? current.messages : nextMessages,
    nextBefore: current.messageWindowFrozen ? current.nextBefore : nextState.nextBefore,
    summary: current.messageWindowFrozen ? current.summary : nextState.summary,
    streamOffset: nextState.streamOffset ?? current.streamOffset,
    streamStatus: current.streamStatus,
    loading: false,
    loadingOlder: false,
    error: null,
    pendingTerminalSyncTurnId: null,
    respondingRequestId: current.respondingRequestId,
    interrupting: nextInterrupting,
    bufferedConversationWindow: current.messageWindowFrozen
      ? nextBufferedWindow
      : null,
  };
}

export async function pollLatestConversation(props: {
  includeRuntime?: boolean;
  providerId: ProviderId;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
  shouldAbort: () => boolean;
}) {
  const {
    includeRuntime = true,
    providerId,
    sessionId,
    setState,
    shouldAbort,
  } = props;
  const nextState = includeRuntime
    ? await loadInitialPage(providerId, sessionId)
    : await loadConversationPageState(providerId, sessionId);
  if (shouldAbort()) {
    return;
  }

  setState((current) => {
    if (current.loading || current.loadingOlder) {
      return current;
    }
    return mergePolledPanelState({
      current,
      nextState: includeRuntime
        ? nextState
        : buildConversationOnlyPollState(current, nextState),
      now: Date.now(),
      providerId,
    });
  });
}

async function loadConversationPageState(
  providerId: ProviderId,
  sessionId: string,
) {
  return loadConversationWindow(providerId, sessionId);
}

export function shouldRefreshConversationDuringRuntime(props: {
  current: PanelState;
  now: number;
  streamAvailable: boolean;
}) {
  const { current, now, streamAvailable } = props;
  if (
    !streamAvailable ||
    current.loading ||
    current.loadingOlder ||
    !hasRuntimeRefreshWork(current)
  ) {
    return false;
  }

  if (current.pendingTerminalSyncTurnId) {
    return true;
  }
  if (current.streamStatus.phase !== "live") {
    return true;
  }

  if (current.streamStatus.lastEventAt === null) {
    return true;
  }

  return now - current.streamStatus.lastEventAt >= STALE_STREAM_ACTIVITY_MS;
}

function isPollStateUnchanged(
  current: PanelState,
  nextState: PanelState,
  runtimeMerged: PanelState,
  conversationChanged: boolean,
): boolean {
  return (
    !current.loading &&
    !current.loadingOlder &&
    current.error === null &&
    !conversationChanged &&
    current.nextBefore === nextState.nextBefore &&
    sameSummary(current.summary, nextState.summary) &&
    sameThreadState(current.threadState, nextState.threadState) &&
    sameUserInputRequests(
      current.pendingUserInputRequests,
      nextState.pendingUserInputRequests,
    ) &&
    current.pendingTerminalSyncTurnId === null &&
    runtimeMerged.pendingTerminalSyncTurnId === null &&
    current.interrupting === runtimeMerged.interrupting &&
    current.sendLifecycle === runtimeMerged.sendLifecycle &&
    current.sendStatus === runtimeMerged.sendStatus &&
    current.sending === runtimeMerged.sending &&
    sameBufferedConversationWindow(
      current.bufferedConversationWindow,
      current.messageWindowFrozen
        ? buildBufferedConversationWindow(resolvePolledMessages(current, nextState), nextState)
        : null,
    )
  );
}

function sameSummary(current: PanelState["summary"], next: PanelState["summary"]) {
  return (current?.id ?? "") === (next?.id ?? "") &&
    (current?.text ?? "") === (next?.text ?? "");
}

function resolvePolledMessages(
  current: PanelState,
  nextState: PanelState,
): PanelState["messages"] {
  if (!current.sendLifecycle || !isSendLifecycleActive(current.sendLifecycle)) {
    return nextState.messages;
  }

  const baseMessages = current.bufferedConversationWindow?.messages ?? current.messages;
  const optimisticMessages = baseMessages.filter(isOptimisticUserMessage);
  if (optimisticMessages.length === 0) {
    return nextState.messages;
  }
  return optimisticMessages.reduce(preservePolledOptimisticMessage, nextState.messages);
}

function hasRuntimeRefreshWork(current: PanelState) {
  return (
    current.sending ||
    current.pendingUserInputRequests.length > 0 ||
    current.pendingTerminalSyncTurnId !== null
  );
}

function preservePolledOptimisticMessage(
  messages: ConversationMessage[],
  optimisticMessage: ConversationMessage,
) {
  if (hasAcknowledgedPolledUserMessage(messages, optimisticMessage)) {
    return messages;
  }
  return insertBeforeTrailingTaskStartedStatuses(messages, optimisticMessage);
}

function buildBufferedConversationWindow(
  messages: PanelState["messages"],
  nextState: PanelState,
): BufferedConversationWindow {
  return {
    messages,
    nextBefore: nextState.nextBefore,
    summary: nextState.summary,
    streamOffset: nextState.streamOffset,
  };
}

function mergeTerminalStatusMessages(
  messages: ConversationMessage[],
  runtimeMessages: ConversationMessage[],
) {
  const existingIds = new Set(messages.map((message) => message.id));
  const appended = runtimeMessages.filter(
    (message) => isLocalTerminalStatusMessage(message) && !existingIds.has(message.id),
  );
  if (appended.length === 0) {
    return stripRedundantLocalTerminalStatusMessages(messages);
  }
  return stripRedundantLocalTerminalStatusMessages([...messages, ...appended]);
}

function buildConversationOnlyPollState(
  current: PanelState,
  nextState: Awaited<ReturnType<typeof loadConversationPageState>>,
): PanelState {
  return {
    ...INITIAL_PANEL_STATE,
    ...current,
    messages: nextState.messages,
    nextBefore: nextState.nextBefore,
    summary: nextState.summary,
    streamOffset: current.streamOffset,
  };
}

function sameBufferedConversationWindow(
  current: BufferedConversationWindow | null,
  next: BufferedConversationWindow | null,
) {
  return JSON.stringify(current) === JSON.stringify(next);
}

function hasAcknowledgedPolledUserMessage(
  messages: ConversationMessage[],
  optimisticMessage: ConversationMessage,
) {
  const optimisticTime = readMessageTime(optimisticMessage);
  const optimisticKey = normalizeUserMessageText(optimisticMessage.text);
  return messages.some((message) =>
    message.role === "user" &&
    message.kind === "text" &&
    !isOptimisticUserMessage(message) &&
    normalizeUserMessageText(message.text) === optimisticKey &&
    (optimisticTime === null ||
      readMessageTime(message) === null ||
      (readMessageTime(message) as number) >= optimisticTime)
  );
}

function insertBeforeTrailingTaskStartedStatuses(
  messages: ConversationMessage[],
  optimisticMessage: ConversationMessage,
) {
  const insertionIndex = findTrailingTaskStartedStart(messages);
  return [
    ...messages.slice(0, insertionIndex),
    optimisticMessage,
    ...messages.slice(insertionIndex),
  ];
}

function findTrailingTaskStartedStart(messages: ConversationMessage[]) {
  let index = messages.length;
  while (index > 0 && isTaskStartedStatusMessage(messages[index - 1] as ConversationMessage)) {
    index -= 1;
  }
  return index;
}

function isTaskStartedStatusMessage(message: ConversationMessage) {
  return message.role === "system" &&
    message.title === "status" &&
    /^任务已开始/.test(message.text);
}

function readMessageTime(message: ConversationMessage): number | null {
  if (!message.timestamp) {
    return null;
  }
  const parsed = Date.parse(message.timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}
