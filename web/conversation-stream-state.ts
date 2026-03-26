import type {
  ConversationMessage,
  ProviderConversationStreamChunk,
  ProviderConversationStreamSnapshot,
  ProviderId,
} from "../api/types";
import type {
  BufferedConversationWindow,
  PanelState,
} from "./conversation-panel-state-types";
import { isOptimisticUserMessage } from "./conversation-panel-state-helpers";
import { createLiveRealtimeStreamStatus } from "./realtime-stream-status";
import { isSendLifecycleActive } from "./conversation-send-state";

export function buildConversationStreamUrl(
  providerId: ProviderId,
  sessionId: string,
  limit: number,
  offset: number | null = null,
) {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  if (typeof offset === "number" && Number.isFinite(offset) && offset > 0) {
    search.set("offset", String(offset));
  }
  return `/api/providers/${providerId}/sessions/${sessionId}/messages/stream?${search.toString()}`;
}

export function applyConversationSnapshot(
  current: PanelState,
  snapshot: ProviderConversationStreamSnapshot,
): PanelState {
  const messages = mergeSnapshotMessages(
    getLatestConversationMessages(current),
    snapshot.messages,
  );
  return applyLatestConversationWindow(current, {
    messages,
    nextBefore: snapshot.nextBefore,
    summary: snapshot.summary,
    streamOffset: snapshot.nextOffset,
  });
}

function mergeSnapshotMessages(
  currentMessages: ConversationMessage[],
  snapshotMessages: ProviderConversationStreamSnapshot["messages"],
) {
  const normalizedSnapshot = normalizeConversationMessages(snapshotMessages);
  const mergedSnapshot = mergeSnapshotBaseMessages(currentMessages, normalizedSnapshot);
  return preserveOptimisticUserMessages(currentMessages, mergedSnapshot);
}

function mergeSnapshotBaseMessages(
  currentMessages: PanelState["messages"],
  snapshotMessages: ProviderConversationStreamSnapshot["messages"],
) {
  if (currentMessages.length === 0 || snapshotMessages.length === 0) {
    return snapshotMessages;
  }

  const snapshotIds = new Set(snapshotMessages.map((message) => message.id));
  const firstOverlapIndex = currentMessages.findIndex((message) =>
    snapshotIds.has(message.id)
  );
  if (firstOverlapIndex <= 0) {
    return snapshotMessages;
  }

  return [
    ...currentMessages.slice(0, firstOverlapIndex),
    ...snapshotMessages,
  ];
}

export function applyConversationDelta(
  current: PanelState,
  update: ProviderConversationStreamChunk,
): PanelState {
  const baseMessages = getLatestConversationMessages(current);
  const appended = appendUnseenMessages(
    baseMessages,
    normalizeConversationMessages(update.messages),
  );
  const sendActive = current.sendLifecycle && isSendLifecycleActive(current.sendLifecycle);
  const messages = sendActive ? appended : dropAcknowledgedOptimisticMessages(appended);
  return applyLatestConversationWindow(current, {
    ...getLatestConversationWindow(current),
    messages,
    streamOffset: update.nextOffset,
  });
}

export function applyBufferedConversationWindow(current: PanelState): PanelState {
  if (!current.bufferedConversationWindow) {
    return current.messageWindowFrozen
      ? { ...current, messageWindowFrozen: false }
      : current;
  }
  return {
    ...current,
    messages: current.bufferedConversationWindow.messages,
    nextBefore: current.bufferedConversationWindow.nextBefore,
    summary: current.bufferedConversationWindow.summary,
    streamOffset: current.bufferedConversationWindow.streamOffset,
    messageWindowFrozen: false,
    bufferedConversationWindow: null,
  };
}

function appendUnseenMessages(
  currentMessages: ConversationMessage[],
  nextMessages: ConversationMessage[],
) {
  const existingIds = new Set(currentMessages.map((message) => message.id));
  const appended = nextMessages.filter((message) => !existingIds.has(message.id));
  if (appended.length === 0) {
    return currentMessages;
  }
  return [...currentMessages, ...appended];
}

function preserveOptimisticUserMessages(
  currentMessages: ConversationMessage[],
  nextMessages: ConversationMessage[],
) {
  const optimisticMessages = currentMessages.filter(isOptimisticUserMessage);
  if (optimisticMessages.length === 0) {
    return nextMessages;
  }

  return optimisticMessages.reduce((messages, optimisticMessage) => {
    if (hasAcknowledgedUserMessage(messages, optimisticMessage)) {
      return messages;
    }
    return insertBeforeTrailingTaskStartedStatuses(messages, optimisticMessage);
  }, nextMessages);
}

function dropAcknowledgedOptimisticMessages(messages: ConversationMessage[]) {
  const acknowledgedIndexes = new Set<number>();
  const pendingByText = new Map<string, number[]>();

  messages.forEach((message, index) => {
    if (isOptimisticUserMessage(message)) {
      const pending = pendingByText.get(message.text) ?? [];
      pending.push(index);
      pendingByText.set(message.text, pending);
      return;
    }
    if (!isAcknowledgingUserMessage(message)) {
      return;
    }
    const pending = pendingByText.get(message.text);
    if (!pending || pending.length === 0) {
      return;
    }
    acknowledgedIndexes.add(pending.shift() as number);
  });

  if (acknowledgedIndexes.size === 0) {
    return messages;
  }
  return messages.filter((_, index) => !acknowledgedIndexes.has(index));
}

function normalizeConversationMessages(messages: ConversationMessage[]) {
  if (messages.length < 2) {
    return messages;
  }

  const normalized: ConversationMessage[] = [];
  let pendingTaskStarted: ConversationMessage[] = [];
  for (const message of messages) {
    if (isTaskStartedStatusMessage(message)) {
      pendingTaskStarted.push(message);
      continue;
    }
    if (pendingTaskStarted.length > 0) {
      if (isAcknowledgingUserMessage(message)) {
        normalized.push(message, ...pendingTaskStarted);
      } else {
        normalized.push(...pendingTaskStarted, message);
      }
      pendingTaskStarted = [];
    } else {
      normalized.push(message);
    }
  }
  if (pendingTaskStarted.length > 0) {
    normalized.push(...pendingTaskStarted);
  }
  return normalized;
}

function applyLatestConversationWindow(
  current: PanelState,
  window: BufferedConversationWindow,
): PanelState {
  const base = {
    ...current,
    streamOffset: window.streamOffset,
    streamStatus: createLiveRealtimeStreamStatus(Date.now()),
    loading: false,
    error: null,
  };
  if (current.messageWindowFrozen) {
    return {
      ...base,
      bufferedConversationWindow: window,
    };
  }
  return {
    ...base,
    messages: window.messages,
    nextBefore: window.nextBefore,
    summary: window.summary,
    bufferedConversationWindow: null,
  };
}

function getLatestConversationMessages(current: PanelState): ConversationMessage[] {
  return getLatestConversationWindow(current).messages;
}

function getLatestConversationWindow(current: PanelState): BufferedConversationWindow {
  return current.bufferedConversationWindow ?? {
    messages: current.messages,
    nextBefore: current.nextBefore,
    summary: current.summary,
    streamOffset: current.streamOffset,
  };
}

function hasAcknowledgedUserMessage(
  messages: ConversationMessage[],
  optimisticMessage: ConversationMessage,
) {
  const optimisticTime = readMessageTime(optimisticMessage);
  return messages.some((message) =>
    isAcknowledgingUserMessage(message) &&
    message.text === optimisticMessage.text &&
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

function isAcknowledgingUserMessage(message: ConversationMessage) {
  return message.role === "user" && message.kind === "text" && !isOptimisticUserMessage(message);
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
