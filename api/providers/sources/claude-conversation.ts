import type { ConversationMessage } from "../../types";
import {
  createConversationAnchor,
  createConversationMessageId,
} from "../conversation-anchor";
import type { JsonlLine } from "../jsonl-window";
import { safeJsonParse, stringifyContent } from "../shared";

interface ClaudeRecord {
  type?: string;
  timestamp?: string;
  summary?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

interface ClaudeConversationResult {
  messages: ConversationMessage[];
  summary: ConversationMessage | null;
}

export function parseClaudeConversationEntries(
  lines: JsonlLine[],
  sessionId: string,
): ClaudeConversationResult {
  const messages: ConversationMessage[] = [];
  let summary: ConversationMessage | null = null;

  for (const entry of lines) {
    const record = safeJsonParse<ClaudeRecord>(entry.line);
    if (!record) {
      continue;
    }

    if (record.type === "summary" && typeof record.summary === "string") {
      summary = {
        anchor: createConversationAnchor(entry.offset),
        id: `${sessionId}:summary:${entry.offset}`,
        role: "system",
        kind: "summary",
        text: record.summary,
        block: {
          type: "summary",
          text: record.summary,
        },
      };
      continue;
    }

    if (!record.message || !Array.isArray(record.message.content)) {
      continue;
    }

    const role = record.message.role === "user" ? "user" : "assistant";
    for (const [blockIndex, item] of record.message.content.entries()) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const message = normalizeClaudeBlock(
        sessionId,
        entry.offset,
        blockIndex,
        record.timestamp,
        role,
        item as Record<string, unknown>,
      );
      if (message) {
        messages.push(message);
      }
    }
  }

  return { messages, summary };
}

function normalizeClaudeBlock(
  sessionId: string,
  lineOffset: number,
  blockIndex: number,
  timestamp: string | undefined,
  role: "user" | "assistant",
  block: Record<string, unknown>,
): ConversationMessage | null {
  const kind = typeof block.type === "string" ? block.type : "";
  const base = {
    anchor: createConversationAnchor(lineOffset, blockIndex),
    id: createConversationMessageId(sessionId, lineOffset, blockIndex),
    role,
    timestamp,
  } as const;

  if (kind === "text") {
    const text = typeof block.text === "string" ? block.text : stringifyContent(block);
    return {
      ...base,
      kind: "text",
      text,
      block: {
        type: "text",
        text,
      },
    };
  }

  if (kind === "thinking") {
    const thinking = typeof block.thinking === "string"
      ? block.thinking
      : stringifyContent(block);
    return {
      ...base,
      kind: "thinking",
      text: thinking,
      block: {
        type: "thinking",
        thinking,
      },
    };
  }

  if (kind === "tool_use") {
    const name = typeof block.name === "string" ? block.name : "tool_use";
    return {
      ...base,
      kind: "tool_use",
      title: name,
      text: stringifyContent(block.input ?? ""),
      block: {
        type: "tool_use",
        id: typeof block.id === "string" ? block.id : undefined,
        name,
        input: block.input ?? "",
      },
    };
  }

  if (kind === "tool_result") {
    const content = block.content ?? "";
    return {
      ...base,
      kind: "tool_result",
      text: stringifyContent(content),
      block: {
        type: "tool_result",
        toolUseId: typeof block.tool_use_id === "string" ? block.tool_use_id : undefined,
        content,
        isError: block.is_error === true,
      },
    };
  }

  return null;
}
