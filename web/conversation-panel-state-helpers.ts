import type { ConversationMessage, SendImageInput } from "../api/types";

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
