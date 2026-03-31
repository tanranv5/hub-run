import type { ConversationMessage } from "../api/types";

const OPTIMISTIC_PREFIX = "optimistic-user:";
const IMMEDIATE_ASSISTANT_PREFIX = "immediate-assistant:";
const TERMINAL_STATUS_PREFIX = "terminal-status:";

export function appendOptimisticUserMessage(
  messages: ConversationMessage[],
  text: string,
  now: number = Date.now(),
): ConversationMessage[] {
  return [
    ...messages,
    {
      id: `${OPTIMISTIC_PREFIX}${now}`,
      role: "user",
      kind: "text",
      text,
      timestamp: new Date(now).toISOString(),
    },
  ];
}

export function hasConversationChanged(
  baselineMessages: ConversationMessage[],
  nextMessages: ConversationMessage[],
): boolean {
  return createConversationSignature(baselineMessages) !==
    createConversationSignature(nextMessages);
}

export function stripOptimisticUserMessages(
  messages: ConversationMessage[],
): ConversationMessage[] {
  return messages.filter((message) => !isOptimisticUserMessage(message));
}

export function isOptimisticUserMessage(message: ConversationMessage): boolean {
  return message.id.startsWith(OPTIMISTIC_PREFIX);
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

function createConversationSignature(messages: ConversationMessage[]): string {
  return messages
    .map((message) =>
      [
        message.id,
        message.role,
        message.kind,
        message.title ?? "",
        message.text,
        message.timestamp ?? "",
      ].join("|"),
    )
    .join("\n");
}
