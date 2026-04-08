import type { ConversationMessage, SendImageInput } from "../api/types";
import { sanitizeConversationText } from "../api/providers/display-text";

const OPTIMISTIC_PREFIX = "optimistic-user:";
const IMMEDIATE_ASSISTANT_PREFIX = "immediate-assistant:";
const TERMINAL_STATUS_PREFIX = "terminal-status:";

export function appendOptimisticUserMessage(
  messages: ConversationMessage[],
  text: string,
  now: number = Date.now(),
): ConversationMessage[] {
  return [...messages, buildOptimisticTextMessage(text, now)];
}

export function appendOptimisticUserInputMessages(
  messages: ConversationMessage[],
  input: { text?: string; images?: SendImageInput[] },
  now: number = Date.now(),
): ConversationMessage[] {
  return [...messages, ...buildOptimisticUserMessages(input, now)];
}

export function hasConversationChanged(
  baselineMessages: ConversationMessage[],
  nextMessages: ConversationMessage[],
): boolean {
  if (baselineMessages === nextMessages) return false;
  if (baselineMessages.length !== nextMessages.length) return true;
  if (baselineMessages.length === 0) return false;
  const first = baselineMessages[0]!;
  const nextFirst = nextMessages[0]!;
  if (first.id !== nextFirst.id) return true;
  const last = baselineMessages[baselineMessages.length - 1]!;
  const nextLast = nextMessages[nextMessages.length - 1]!;
  return last.id !== nextLast.id ||
    last.text !== nextLast.text ||
    last.timestamp !== nextLast.timestamp;
}

export function stripOptimisticUserMessages(
  messages: ConversationMessage[],
): ConversationMessage[] {
  return messages.filter((message) => !isOptimisticUserMessage(message));
}

export function isOptimisticUserMessage(message: ConversationMessage): boolean {
  return message.id.startsWith(OPTIMISTIC_PREFIX);
}

export function preserveUnacknowledgedOptimisticMessages(
  currentMessages: ConversationMessage[],
  nextMessages: ConversationMessage[],
): ConversationMessage[] {
  return currentMessages
    .filter(isOptimisticUserMessage)
    .reduce((messages, optimisticMessage) => {
      if (
        messages.some((message) => message.id === optimisticMessage.id) ||
        hasAcknowledgedUserMessage(messages, optimisticMessage)
      ) {
        return messages;
      }
      return insertBeforeTrailingTaskStartedStatuses(messages, optimisticMessage);
    }, nextMessages);
}

export function dropAcknowledgedOptimisticUserMessages(
  messages: ConversationMessage[],
): ConversationMessage[] {
  const acknowledgedIndexes = new Set<number>();
  const pendingByKey = new Map<string, Array<{ index: number; time: number | null }>>();

  messages.forEach((message, index) => {
    const key = readUserMessageAckKey(message);
    if (!key) {
      return;
    }
    if (isOptimisticUserMessage(message)) {
      const pending = pendingByKey.get(key) ?? [];
      pending.push({ index, time: readMessageTime(message) });
      pendingByKey.set(key, pending);
      return;
    }
    acknowledgePendingOptimisticMessage(
      pendingByKey.get(key),
      readMessageTime(message),
      acknowledgedIndexes,
    );
  });

  return acknowledgedIndexes.size === 0
    ? messages
    : messages.filter((_, index) => !acknowledgedIndexes.has(index));
}

export function appendImmediateAssistantMessage(
  messages: ConversationMessage[],
  text: string,
  now: number = Date.now(),
): ConversationMessage[] {
  return [
    ...messages,
    {
      id: `${IMMEDIATE_ASSISTANT_PREFIX}${now}`,
      role: "assistant",
      kind: "text",
      text,
      timestamp: new Date(now).toISOString(),
    },
  ];
}

export function isLocalTerminalStatusMessage(message: ConversationMessage): boolean {
  return message.id.startsWith(TERMINAL_STATUS_PREFIX);
}

export function hasEquivalentStatusMessage(
  messages: ConversationMessage[],
  target: ConversationMessage,
): boolean {
  if (!isStatusMessage(target)) {
    return false;
  }
  return messages.some(
    (message) => message.id !== target.id && isStatusMessage(message) && message.text === target.text,
  );
}

export function stripRedundantLocalTerminalStatusMessages(
  messages: ConversationMessage[],
): ConversationMessage[] {
  const persistedStatusTexts = new Set(
    messages
      .filter((message) => isStatusMessage(message) && !isLocalTerminalStatusMessage(message))
      .map((message) => message.text),
  );
  if (persistedStatusTexts.size === 0) {
    return messages;
  }
  return messages.filter(
    (message) =>
      !(
        isLocalTerminalStatusMessage(message) &&
        persistedStatusTexts.has(message.text)
      ),
  );
}

function isStatusMessage(message: ConversationMessage): boolean {
  return message.role === "system" && message.kind === "text" && message.title === "status";
}

function hasAcknowledgedUserMessage(
  messages: ConversationMessage[],
  optimisticMessage: ConversationMessage,
) {
  const optimisticKey = readUserMessageAckKey(optimisticMessage);
  if (!optimisticKey) {
    return false;
  }
  const optimisticTime = readMessageTime(optimisticMessage);
  return messages.some((message) =>
    message.id !== optimisticMessage.id &&
    !isOptimisticUserMessage(message) &&
    readUserMessageAckKey(message) === optimisticKey &&
    canAcknowledgeOptimisticMessage(optimisticTime, readMessageTime(message))
  );
}

function readUserMessageAckKey(message: ConversationMessage): string | null {
  if (message.role !== "user") {
    return null;
  }
  if (message.kind === "text") {
    const text = sanitizeConversationText(message.text).trim();
    return text ? `text:${text}` : null;
  }
  if (message.kind !== "image" || message.block?.type !== "image") {
    return null;
  }
  const imageUrl = message.block.imageUrl?.trim();
  if (imageUrl) {
    return `imageUrl:${imageUrl}`;
  }
  const imagePath = message.block.imagePath?.trim();
  return imagePath ? `imagePath:${imagePath}` : null;
}

function acknowledgePendingOptimisticMessage(
  pending: Array<{ index: number; time: number | null }> | undefined,
  messageTime: number | null,
  acknowledgedIndexes: Set<number>,
) {
  if (!pending || pending.length === 0) {
    return;
  }
  const pendingIndex = pending.findIndex((entry) =>
    canAcknowledgeOptimisticMessage(entry.time, messageTime)
  );
  if (pendingIndex < 0) {
    return;
  }
  const [matched] = pending.splice(pendingIndex, 1);
  if (matched) {
    acknowledgedIndexes.add(matched.index);
  }
}

function canAcknowledgeOptimisticMessage(
  optimisticTime: number | null,
  messageTime: number | null,
) {
  return optimisticTime === null || messageTime === null || messageTime >= optimisticTime;
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

export function isTaskStartedStatusMessage(message: ConversationMessage) {
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

function buildOptimisticUserMessages(
  input: { text?: string; images?: SendImageInput[] },
  now: number,
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  const text = input.text?.trim() ?? "";
  if (text) {
    messages.push(buildOptimisticTextMessage(text, now));
  }
  input.images?.forEach((image, index) => {
    const url = image.url.trim();
    if (!url) {
      return;
    }
    messages.push({
      id: `${OPTIMISTIC_PREFIX}${now}:image:${index}`,
      role: "user",
      kind: "image",
      text: image.name?.trim() ?? "",
      timestamp: new Date(now).toISOString(),
      block: {
        type: "image",
        imageUrl: url,
      },
    });
  });
  return messages;
}

function buildOptimisticTextMessage(text: string, now: number): ConversationMessage {
  return {
    id: `${OPTIMISTIC_PREFIX}${now}`,
    role: "user",
    kind: "text",
    text,
    timestamp: new Date(now).toISOString(),
  };
}
