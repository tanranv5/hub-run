import { filterConversationMessages } from "../../conversation-search";
import type { ConversationPage, ConversationSearchMode } from "../../types";
import {
  encodeMessageWindowCursor,
  readJsonLinesFromOffset,
  readJsonPrefixLines,
  readJsonTailWindow,
} from "../jsonl-window";
import { parseClaudeConversationEntries } from "./claude-conversation";

const RECENT_MIN_LINES = 64;
const RECENT_MESSAGE_MULTIPLIER = 4;

export async function readLatestClaudeConversationPage(
  filePath: string,
  sessionId: string,
  limit: number,
  summary: ConversationPage["summary"],
  mode: ConversationSearchMode = "all",
): Promise<ConversationPage> {
  const recent = await readRecentChunk(filePath, sessionId, limit, mode);
  const end = recent.messages.length;
  const start = Math.max(0, end - limit);
  return {
    messages: recent.messages.slice(start, end),
    nextBefore: buildRecentNextBefore(recent.startOffset, start),
    summary,
  };
}

export async function readTailClaudeConversationPage(
  filePath: string,
  sessionId: string,
  limit: number,
  cursor: { offset: number; before: number | null },
  summary: ConversationPage["summary"],
  mode: ConversationSearchMode = "all",
): Promise<ConversationPage> {
  const lines = await readJsonLinesFromOffset(filePath, cursor.offset);
  const conversation = parseClaudeConversationEntries(lines, sessionId);
  const messages = filterByMode(conversation.messages, mode);
  const end = Math.min(
    cursor.before ?? messages.length,
    messages.length,
  );
  const start = Math.max(0, end - limit);
  return {
    messages: messages.slice(start, end),
    nextBefore: buildRecentNextBefore(cursor.offset, start),
    summary,
  };
}

export async function readPrefixClaudeConversationPage(
  filePath: string,
  sessionId: string,
  limit: number,
  cursor: { offset: number; before: number | null },
  summary: ConversationPage["summary"],
  mode: ConversationSearchMode = "all",
): Promise<ConversationPage> {
  const lines = await readJsonPrefixLines(filePath, cursor.offset);
  const conversation = parseClaudeConversationEntries(lines, sessionId);
  const messages = filterByMode(conversation.messages, mode);
  const end = cursor.before ?? messages.length;
  const start = Math.max(0, end - limit);
  return {
    messages: messages.slice(start, end),
    nextBefore:
      start > 0
        ? encodeMessageWindowCursor("prefix", cursor.offset, start)
        : null,
    summary: conversation.summary ?? summary,
  };
}

function buildRecentNextBefore(
  startOffset: number,
  startIndex: number,
): string | null {
  if (startIndex <= 0) {
    return startOffset > 0
      ? encodeMessageWindowCursor("prefix", startOffset)
      : null;
  }

  if (startOffset === 0) {
    return String(startIndex);
  }

  return encodeMessageWindowCursor("tail", startOffset, startIndex);
}

async function readRecentChunk(
  filePath: string,
  sessionId: string,
  limit: number,
  mode: ConversationSearchMode,
) {
  const targetMessages = Math.max(limit * RECENT_MESSAGE_MULTIPLIER, limit + 1);
  let lineCount = Math.max(RECENT_MIN_LINES, targetMessages * 8);

  while (true) {
    const window = await readJsonTailWindow(filePath, lineCount);
    const conversation = parseClaudeConversationEntries(window.lines, sessionId);
    const messages = filterByMode(conversation.messages, mode);
    if (messages.length >= targetMessages || window.exhausted) {
      return {
        messages,
        startOffset: window.startOffset,
      };
    }
    lineCount *= 2;
  }
}

function filterByMode(
  messages: ConversationPage["messages"],
  mode: ConversationSearchMode,
) {
  return mode === "all" ? messages : filterConversationMessages(messages, mode);
}
