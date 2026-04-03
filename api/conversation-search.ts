import type {
  ConversationAnchor,
  ConversationContextResult,
  ConversationLocateResult,
  ConversationMessage,
  ConversationSearchHit,
  ConversationSearchMode,
  ConversationSearchPageResult,
  ConversationSearchRange,
  ConversationSearchResult,
} from "./types";
import { isConversationAnchorAfter } from "./providers/conversation-anchor";
import { sanitizeConversationText } from "./providers/display-text";

const PREVIEW_PADDING = 48;
const PREVIEW_MAX_LENGTH = 160;

export function readConversationVisibleText(message: ConversationMessage): string {
  return sanitizeConversationText(message.text).trim();
}

export function matchesConversationSearchMode(
  message: ConversationMessage,
  mode: ConversationSearchMode,
): boolean {
  if (mode === "all") {
    return hasVisibleMessageContent(message);
  }
  if (mode === "compact") {
    return isCompactVisibleMessage(message);
  }
  return isPureTextVisibleMessage(message);
}

export function filterConversationMessages(
  messages: ConversationMessage[],
  mode: ConversationSearchMode,
): ConversationMessage[] {
  return messages.filter((message) => matchesConversationSearchMode(message, mode));
}

export function searchConversationMessages(props: {
  messages: ConversationMessage[];
  mode: ConversationSearchMode;
  query: string;
  recentLimit?: number | null;
}): ConversationSearchResult {
  const { messages, mode } = props;
  const query = props.query.trim();
  const filteredMessages = scopeConversationMessages(messages, mode, props.recentLimit);
  if (!query) {
    return buildEmptySearchResult(query, mode, filteredMessages.length);
  }
  const hits = filteredMessages.flatMap((message, index) =>
    buildSearchHit(message, query, index),
  );
  return {
    query,
    mode,
    totalMessages: filteredMessages.length,
    totalHits: hits.length,
    hits,
  };
}

export function locateConversationMessages(props: {
  messageId: string;
  messages: ConversationMessage[];
  mode: ConversationSearchMode;
  window: number;
}): ConversationLocateResult | null {
  const filteredMessages = filterConversationMessages(props.messages, props.mode);
  const hitIndex = filteredMessages.findIndex((message) => message.id === props.messageId);
  if (hitIndex < 0) {
    return null;
  }
  return buildConversationWindowResult(
    filteredMessages,
    props.messageId,
    hitIndex,
    props.window,
  );
}

export function searchConversationMessagePage(props: {
  anchor: ConversationAnchor | null;
  limit: number;
  messages: ConversationMessage[];
  mode: ConversationSearchMode;
  query: string;
  recentLimit?: number | null;
}): ConversationSearchPageResult {
  const searchResult = searchConversationMessages({
    messages: props.messages,
    mode: props.mode,
    query: props.query,
    recentLimit: props.recentLimit,
  });
  const filteredHits = props.anchor
    ? searchResult.hits.filter((hit) => isConversationAnchorAfter(hit.anchor, props.anchor))
    : searchResult.hits;
  const hits = filteredHits.slice(0, Math.max(1, props.limit));
  const hasMore = filteredHits.length > hits.length;
  return {
    query: searchResult.query,
    mode: searchResult.mode,
    totalHits: searchResult.totalHits,
    hits,
    nextAnchor: hasMore ? (hits[hits.length - 1]?.anchor ?? null) : null,
  };
}

function scopeConversationMessages(
  messages: ConversationMessage[],
  mode: ConversationSearchMode,
  recentLimit: number | null | undefined,
) {
  const filteredMessages = filterConversationMessages(messages, mode);
  const normalizedRecentLimit = normalizeRecentLimit(recentLimit);
  if (!normalizedRecentLimit || filteredMessages.length <= normalizedRecentLimit) {
    return filteredMessages;
  }
  return filteredMessages.slice(-normalizedRecentLimit);
}

function normalizeRecentLimit(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const limit = Math.floor(value);
  return limit > 0 ? limit : null;
}

export function readConversationContextResult(props: {
  messageId: string;
  messages: ConversationMessage[];
  mode: ConversationSearchMode;
  window: number;
}): ConversationContextResult | null {
  const filteredMessages = filterConversationMessages(props.messages, props.mode);
  const hitIndex = filteredMessages.findIndex((message) => message.id === props.messageId);
  if (hitIndex < 0) {
    return null;
  }
  const hitMessage = filteredMessages[hitIndex];
  if (!hitMessage?.anchor) {
    return null;
  }
  return {
    anchor: hitMessage.anchor,
    ...buildConversationWindowResult(
      filteredMessages,
      props.messageId,
      hitIndex,
      props.window,
    ),
  };
}

function buildEmptySearchResult(
  query: string,
  mode: ConversationSearchMode,
  totalMessages: number,
): ConversationSearchResult {
  return {
    query,
    mode,
    totalMessages,
    totalHits: 0,
    hits: [],
  };
}

function buildConversationWindowResult(
  filteredMessages: ConversationMessage[],
  messageId: string,
  hitIndex: number,
  window: number,
): ConversationLocateResult {
  const radius = Math.max(0, Math.floor(window / 2));
  const start = Math.max(0, hitIndex - radius);
  const end = Math.min(filteredMessages.length, hitIndex + radius + 1);
  return {
    hitMessageId: messageId,
    messages: filteredMessages.slice(start, end),
    hasOlder: start > 0,
    hasNewer: end < filteredMessages.length,
  };
}

function hasVisibleMessageContent(message: ConversationMessage): boolean {
  if (message.kind === "image") {
    return Boolean(message.block?.imagePath || message.block?.imageUrl || message.text.trim());
  }
  if (message.kind === "tool_use" || message.kind === "tool_result") {
    return Boolean(message.title || message.text.trim());
  }
  if (message.kind === "thinking" || message.kind === "summary" || message.kind === "turn_aborted") {
    return true;
  }
  return readConversationVisibleText(message).length > 0;
}

function isCompactVisibleMessage(message: ConversationMessage): boolean {
  if (message.kind === "turn_aborted") {
    return true;
  }
  if (message.kind !== "text") {
    return false;
  }
  if (message.title === "status") {
    return true;
  }
  if (message.role !== "user" && message.role !== "assistant") {
    return false;
  }
  return readConversationVisibleText(message).length > 0;
}

function isPureTextVisibleMessage(message: ConversationMessage): boolean {
  if (message.kind !== "text") {
    return false;
  }
  if (message.role !== "user" && message.role !== "assistant") {
    return false;
  }
  return readConversationVisibleText(message).length > 0;
}

function buildSearchHit(
  message: ConversationMessage,
  query: string,
  messageIndex: number,
): ConversationSearchHit[] {
  const haystack = readConversationSearchableText(message);
  if (!haystack) {
    return [];
  }
  const ranges = findConversationSearchRanges(haystack, query);
  if (ranges.length === 0) {
    return [];
  }
  const preview = buildPreviewText(haystack, ranges);
  return [{
    anchor: message.anchor ?? { offset: 0, blockIndex: 0 },
    messageId: message.id,
    messageIndex,
    role: message.role,
    kind: message.kind,
    timestamp: message.timestamp,
    preview: preview.text,
    ranges: preview.ranges,
  }];
}

export function readConversationSearchableText(message: ConversationMessage): string {
  if (message.kind === "tool_use" || message.kind === "tool_result") {
    return (message.title ? `${message.title}\n` : "") + message.text.trim();
  }
  if (message.kind === "image") {
    return (message.block?.imagePath ?? message.block?.imageUrl ?? message.text).trim();
  }
  if (message.kind === "thinking" || message.kind === "summary" || message.kind === "turn_aborted") {
    return message.text.trim();
  }
  return readConversationVisibleText(message);
}

export function findConversationSearchRanges(
  haystack: string,
  query: string,
): ConversationSearchRange[] {
  const normalizedHaystack = haystack.toLocaleLowerCase();
  const normalizedQuery = query.toLocaleLowerCase();
  const ranges: ConversationSearchRange[] = [];
  let fromIndex = 0;
  while (fromIndex < normalizedHaystack.length) {
    const matchIndex = normalizedHaystack.indexOf(normalizedQuery, fromIndex);
    if (matchIndex < 0) {
      break;
    }
    ranges.push({ start: matchIndex, end: matchIndex + normalizedQuery.length });
    fromIndex = matchIndex + Math.max(1, normalizedQuery.length);
  }
  return ranges;
}

function buildPreviewText(
  haystack: string,
  ranges: ConversationSearchRange[],
): { text: string; ranges: ConversationSearchRange[] } {
  if (haystack.length <= PREVIEW_MAX_LENGTH) {
    return { text: haystack, ranges };
  }
  const firstRange = ranges[0] ?? { start: 0, end: 0 };
  const previewStart = Math.max(0, firstRange.start - PREVIEW_PADDING);
  const previewEnd = Math.min(
    haystack.length,
    Math.max(firstRange.end + PREVIEW_PADDING, previewStart + PREVIEW_MAX_LENGTH),
  );
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < haystack.length ? "..." : "";
  const text = `${prefix}${haystack.slice(previewStart, previewEnd)}${suffix}`;
  const offset = prefix.length - previewStart;
  const previewRanges = ranges
    .map((range) => ({
      start: range.start + offset,
      end: range.end + offset,
    }))
    .filter((range) => range.end > 0 && range.start < text.length)
    .map((range) => ({
      start: Math.max(0, range.start),
      end: Math.min(text.length, range.end),
    }));
  return { text, ranges: previewRanges };
}
