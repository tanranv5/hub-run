import type { ConversationMessage } from "../api/types";

const OPTIMISTIC_PREFIX = "optimistic-user:";
const IMMEDIATE_ASSISTANT_PREFIX = "immediate-assistant:";

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
