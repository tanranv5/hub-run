import {
  searchConversationMessagePage,
} from "../../conversation-search";
import type {
  ConversationAnchor,
  ConversationMessage,
  ConversationSearchMode,
  ConversationSearchPageResult,
} from "../../types";
import {
  readJsonForwardWindow,
  type JsonlLine,
} from "../jsonl-window";

const SEARCH_PAGE_MIN_LINES = 64;
const SEARCH_PAGE_LINE_MULTIPLIER = 32;

function createInitialLineCount(limit: number): number {
  return Math.max(
    SEARCH_PAGE_MIN_LINES,
    Math.max(1, limit) * SEARCH_PAGE_LINE_MULTIPLIER,
  );
}

function readStartOffset(anchor: ConversationAnchor | null): number {
  return anchor?.offset ?? 0;
}

function hasMoreHits(
  page: ConversationSearchPageResult,
  windowExhausted: boolean,
): boolean {
  return page.nextAnchor !== null || !windowExhausted;
}

function createEmptyPage(
  query: string,
  mode: ConversationSearchMode,
): ConversationSearchPageResult {
  return {
    query: query.trim(),
    mode,
    totalHits: 0,
    hits: [],
    nextAnchor: null,
  };
}

export async function readConversationSearchPage(props: {
  anchor: ConversationAnchor | null;
  filePath: string;
  limit: number;
  mode: ConversationSearchMode;
  parseMessages: (lines: JsonlLine[]) => ConversationMessage[];
  query: string;
  recentLimit?: number | null;
}): Promise<ConversationSearchPageResult> {
  const {
    anchor,
    filePath,
    limit,
    mode,
    parseMessages,
    query,
    recentLimit,
  } = props;
  if (!query.trim()) {
    return createEmptyPage(query, mode);
  }

  let lineCount = createInitialLineCount(limit);
  const startOffset = readStartOffset(anchor);

  while (true) {
    const window = await readJsonForwardWindow(filePath, startOffset, lineCount);
    const page = searchConversationMessagePage({
      anchor,
      limit,
      messages: parseMessages(window.lines),
      mode,
      query,
      recentLimit,
    });
    if (page.hits.length >= limit || !hasMoreHits(page, window.exhausted)) {
      return page;
    }
    lineCount *= 2;
  }
}
