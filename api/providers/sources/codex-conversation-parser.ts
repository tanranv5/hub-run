import type { ConversationMessage } from "../../types";
import type { JsonlLine } from "../jsonl-window";
import { safeJsonParse, stringifyContent } from "../shared";
import {
  createMessageId,
  normalizeCodexBlock,
  readCallId,
  readEventStatusText,
  readReasoningText,
  readToolTitle,
} from "./codex-conversation-parser-helpers";

interface CodexRecord {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface CodexConversationState {
  messages: ConversationMessage[];
  pendingStatusMessages: ConversationMessage[];
  toolNames: Map<string, string>;
}

const RESPONSE_TOOL_CALL_TYPES = new Set([
  "function_call",
  "custom_tool_call",
  "web_search_call",
]);
const RESPONSE_TOOL_RESULT_TYPES = new Set([
  "function_call_output",
  "custom_tool_call_output",
]);

export function parseCodexConversationLines(
  lines: string[],
  sessionId: string,
): ConversationMessage[] {
  return parseCodexConversationEntries(
    lines.map((line, index) => ({ line, offset: index })),
    sessionId,
  );
}

export function parseCodexConversationEntries(
  lines: JsonlLine[],
  sessionId: string,
): ConversationMessage[] {
  const state: CodexConversationState = {
    messages: [],
    pendingStatusMessages: [],
    toolNames: new Map<string, string>(),
  };

  for (const entry of lines) {
    const record = safeJsonParse<CodexRecord>(entry.line);
    if (!record?.payload || typeof record.payload !== "object") {
      continue;
    }
    parseCodexRecord(state, sessionId, entry.offset, record);
  }

  flushPendingStatusMessages(state);
  return state.messages;
}

function parseCodexRecord(
  state: CodexConversationState,
  sessionId: string,
  lineIndex: number,
  record: CodexRecord,
) {
  if (record.type === "response_item") {
    parseResponseItem(state, sessionId, lineIndex, record);
    return;
  }

  if (record.type === "event_msg") {
    parseEventMessage(state, sessionId, lineIndex, record);
  }
}

function parseResponseItem(
  state: CodexConversationState,
  sessionId: string,
  lineIndex: number,
  record: CodexRecord,
) {
  const payload = record.payload ?? {};
  const payloadType = typeof payload.type === "string" ? payload.type : "";

  if (payloadType === "message") {
    parseResponseMessage(state, sessionId, lineIndex, record.timestamp, payload);
    return;
  }

  if (payloadType === "reasoning") {
    parseResponseReasoning(state, sessionId, lineIndex, record.timestamp, payload);
    return;
  }

  if (RESPONSE_TOOL_CALL_TYPES.has(payloadType)) {
    parseResponseToolCall(state, sessionId, lineIndex, record.timestamp, payload, payloadType);
    return;
  }

  if (RESPONSE_TOOL_RESULT_TYPES.has(payloadType)) {
    parseResponseToolResult(state, sessionId, lineIndex, record.timestamp, payload);
  }
}

function parseResponseMessage(
  state: CodexConversationState,
  sessionId: string,
  lineIndex: number,
  timestamp: string | undefined,
  payload: Record<string, unknown>,
) {
  if (!Array.isArray(payload.content)) {
    return;
  }

  const roleValue = payload.role;
  if (roleValue !== "user" && roleValue !== "assistant") {
    return;
  }
  const role = roleValue;
  if (role === "assistant") {
    flushPendingStatusMessages(state);
  }
  for (const item of payload.content) {
    const message = normalizeCodexBlock(
      createMessageId(sessionId, lineIndex, state.messages.length),
      role,
      timestamp,
      item,
    );
    if (!message) {
      continue;
    }
    state.messages.push(message);
  }
  if (role === "user") {
    flushPendingStatusMessages(state);
  }
}

function parseResponseReasoning(
  state: CodexConversationState,
  sessionId: string,
  lineIndex: number,
  timestamp: string | undefined,
  payload: Record<string, unknown>,
) {
  flushPendingStatusMessages(state);
  const text = readReasoningText(payload);
  if (!text) {
    return;
  }
  state.messages.push({
    id: createMessageId(sessionId, lineIndex, state.messages.length),
    role: "assistant",
    kind: "thinking",
    text,
    timestamp,
    block: {
      type: "thinking",
      thinking: text,
    },
  });
}

function parseResponseToolCall(
  state: CodexConversationState,
  sessionId: string,
  lineIndex: number,
  timestamp: string | undefined,
  payload: Record<string, unknown>,
  payloadType: string,
) {
  flushPendingStatusMessages(state);
  const callId = readCallId(payload, lineIndex);
  const title = readToolTitle(payload, payloadType);
  state.toolNames.set(callId, title);
  state.messages.push({
    id: createMessageId(sessionId, lineIndex, state.messages.length),
    role: "assistant",
    kind: "tool_use",
    text: stringifyContent(payload.arguments ?? payload.input ?? ""),
    title,
    timestamp,
    block: {
      type: "tool_use",
      id: callId,
      name: title,
      input: payload.arguments ?? payload.input ?? "",
    },
  });
}

function parseResponseToolResult(
  state: CodexConversationState,
  sessionId: string,
  lineIndex: number,
  timestamp: string | undefined,
  payload: Record<string, unknown>,
) {
  flushPendingStatusMessages(state);
  const callId = readCallId(payload, lineIndex);
  const title = state.toolNames.get(callId);
  state.messages.push({
    id: createMessageId(sessionId, lineIndex, state.messages.length),
    role: "assistant",
    kind: "tool_result",
    text: stringifyContent(payload.output ?? payload.content ?? ""),
    ...(title ? { title } : {}),
    timestamp,
    block: {
      type: "tool_result",
      ...(title ? { name: title } : {}),
      toolUseId: callId,
      content: payload.output ?? payload.content ?? "",
      isError: payload.is_error === true,
    },
  });
}

function parseEventMessage(
  state: CodexConversationState,
  sessionId: string,
  lineIndex: number,
  record: CodexRecord,
) {
  const payload = record.payload ?? {};
  const payloadType = typeof payload.type === "string" ? payload.type : "";

  if (payloadType === "agent_reasoning") {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return;
    }
    state.messages.push({
      id: createMessageId(sessionId, lineIndex, state.messages.length),
      role: "assistant",
      kind: "thinking",
      text,
      timestamp: record.timestamp,
      block: {
        type: "thinking",
        thinking: text,
      },
    });
    return;
  }

  const statusText = readEventStatusText(payloadType, payload);
  if (!statusText) {
    return;
  }
  const message = {
    id: createMessageId(sessionId, lineIndex, state.messages.length),
    role: "system",
    kind: statusText.kind,
    text: statusText.text,
    title: statusText.title,
    timestamp: record.timestamp,
    block: {
      type: statusText.kind,
      text: statusText.text,
      title: statusText.title,
    },
  } satisfies ConversationMessage;
  if (payloadType === "task_started") {
    state.pendingStatusMessages.push(message);
    return;
  }
  flushPendingStatusMessages(state);
  state.messages.push(message);
}

function flushPendingStatusMessages(state: CodexConversationState) {
  if (state.pendingStatusMessages.length === 0) {
    return;
  }
  state.messages.push(...state.pendingStatusMessages);
  state.pendingStatusMessages = [];
}
