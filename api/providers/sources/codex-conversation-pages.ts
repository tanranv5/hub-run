import { filterConversationMessages } from "../../conversation-search";
import type { ConversationPage, ConversationSearchMode } from "../../types";
import {
  encodeMessageWindowCursor,
  readJsonLinesFromOffset,
  readJsonPrefixLines,
  readJsonTailWindow,
} from "../jsonl-window";
import { readCodexConversationEntries } from "./codex-session-files";

const RECENT_MIN_LINES = 64;
const RECENT_MESSAGE_MULTIPLIER = 4;

export async function readLatestCodexConversationPage(
  filePath: string,
  sessionId: string,
  limit: number,
  mode: ConversationSearchMode = "all",
): Promise<ConversationPage> {
  const recent = await readRecentChunk(filePath, sessionId, limit, mode);
  const end = recent.messages.length;
  const start = Math.max(0, end - limit);
  return {
    messages: recent.messages.slice(start, end),
    nextBefore: buildRecentNextBefore(recent.startOffset, start),
    summary: null,
  };
}

export async function readTailCodexConversationPage(
  filePath: string,
  sessionId: string,
  limit: number,
  cursor: { offset: number; before: number | null },
  mode: ConversationSearchMode = "all",
): Promise<ConversationPage> {
  const lines = await readJsonLinesFromOffset(filePath, cursor.offset);
  const messages = filterByMode(readCodexConversationEntries(lines, sessionId), mode);
  const end = Math.min(cursor.before ?? messages.length, messages.length);
  const start = Math.max(0, end - limit);
  return {
    messages: messages.slice(start, end),
    nextBefore: buildRecentNextBefore(cursor.offset, start),
    summary: null,
  };
}

export async function readPrefixCodexConversationPage(
  filePath: string,
  sessionId: string,
  limit: number,
  cursor: { offset: number; before: number | null },
  mode: ConversationSearchMode = "all",
): Promise<ConversationPage> {
  const lines = await readJsonPrefixLines(filePath, cursor.offset);
  const messages = filterByMode(readCodexConversationEntries(lines, sessionId), mode);
  const end = cursor.before ?? messages.length;
  const start = Math.max(0, end - limit);
  return {
    messages: messages.slice(start, end),
    nextBefore:
      start > 0
        ? encodeMessageWindowCursor("prefix", cursor.offset, start)
        : null,
    summary: null,
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
    const messages = filterByMode(
      readCodexConversationEntries(window.lines, sessionId),
      mode,
    );
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
