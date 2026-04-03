import {
  searchConversationMessages as searchVisibleConversationMessages,
} from "../api/conversation-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ConversationAnchor,
  ConversationContextResult,
  ConversationLocateResult,
  ConversationMessage,
  ConversationSearchHit,
  ConversationSearchMode,
  ConversationSearchPageResult,
  ConversationSearchResult,
  ProviderId,
} from "../api/types";
import {
  readConversationMessageContext,
  searchConversationMessagePage,
} from "./api";

export type ConversationSearchScope = "current" | "all";

const SEARCH_CONTEXT_WINDOW_SIZE = 11;
const SEARCH_ERROR_MESSAGE = "搜索失败，请重试";
const SEARCH_CONTEXT_ERROR_MESSAGE = "读取搜索上下文失败";
export const RECENT_SEARCH_MESSAGE_LIMIT = 10;
export const ALL_SEARCH_RESULT_LIMIT = 100;
const SEARCH_PAGE_LIMIT_BY_FONT_SCALE: Record<number, number> = {
  1: 20,
  2: 18,
  3: 16,
  4: 14,
  5: 12,
  6: 10,
};

function createEmptySearchResult(
  query: string,
  mode: ConversationSearchMode,
): ConversationSearchResult {
  return {
    query,
    mode,
    totalMessages: 0,
    totalHits: 0,
    hits: [],
  };
}

function createEmptySearchPage(
  query: string,
  mode: ConversationSearchMode,
): ConversationSearchPageResult {
  return {
    query,
    mode,
    totalHits: 0,
    hits: [],
    nextAnchor: null,
  };
}

export function resolveSearchPageLimit(fontScale: number): number {
  return SEARCH_PAGE_LIMIT_BY_FONT_SCALE[fontScale] ?? SEARCH_PAGE_LIMIT_BY_FONT_SCALE[4];
}

export function getWrappedSearchHitIndex(
  currentIndex: number,
  totalHits: number,
  direction: 1 | -1,
): number {
  if (totalHits <= 0) {
    return -1;
  }
  if (currentIndex < 0 || currentIndex >= totalHits) {
    return direction > 0 ? 0 : totalHits - 1;
  }
  return (currentIndex + direction + totalHits) % totalHits;
}

export function createConversationMessageIdSet(
  messages: ConversationMessage[],
): Set<string> {
  return new Set(messages.map((message) => message.id));
}

export function resolvePreferredSearchHitIndex(
  result: ConversationSearchResult,
  previousHit: ConversationSearchHit | null,
): number {
  if (!previousHit) {
    return result.hits.length > 0 ? 0 : -1;
  }
  const nextIndex = result.hits.findIndex((hit) => hit.messageId === previousHit.messageId);
  return nextIndex >= 0 ? nextIndex : (result.hits.length > 0 ? 0 : -1);
}

function readHitAtIndex(
  result: ConversationSearchResult | null,
  index: number,
): ConversationSearchHit | null {
  if (!result || index < 0 || index >= result.hits.length) {
    return null;
  }
  return result.hits[index] ?? null;
}

function createEmptyCurrentSearchState(mode: ConversationSearchMode) {
  return {
    activeHitIndex: -1,
    activeMessageId: null as string | null,
    result: createEmptySearchResult("", mode),
  };
}

function createEmptyAllSearchState(mode: ConversationSearchMode) {
  return {
    activeHitIndex: -1,
    activeMessageId: null as string | null,
    hits: [] as ConversationSearchHit[],
    page: createEmptySearchPage("", mode),
    showingResultsPage: false,
  };
}

export function readSearchPageResultCountLabel(props: {
  activeHitIndex: number;
  totalHits: number;
  visibleHits?: number;
}): string {
  const { activeHitIndex, totalHits, visibleHits } = props;
  const displayTotal = visibleHits ?? totalHits;
  if (displayTotal <= 0) {
    return "0/0";
  }
  if (activeHitIndex < 0) {
    return `1/${displayTotal}`;
  }
  return `${Math.min(activeHitIndex + 1, displayTotal)}/${displayTotal}`;
}

function buildCurrentSearchResult(
  visibleMessages: ConversationMessage[],
  query: string,
  mode: ConversationSearchMode,
  recentLimit: number,
): ConversationSearchResult {
  return searchVisibleConversationMessages({
    messages: visibleMessages,
    mode,
    query,
    recentLimit,
  });
}

function readCurrentActiveMessageId(
  result: ConversationSearchResult,
  activeHitIndex: number,
): string | null {
  return readHitAtIndex(result, activeHitIndex)?.messageId ?? null;
}

function readCurrentMatchedMessageIds(result: ConversationSearchResult): Set<string> {
  return new Set(result.hits.map((hit) => hit.messageId));
}

function toLocateWindow(result: ConversationContextResult): ConversationLocateResult {
  return {
    hitMessageId: result.hitMessageId,
    messages: result.messages,
    hasOlder: result.hasOlder,
    hasNewer: result.hasNewer,
  };
}

export function useConversationPanelSearch(props: {
  mode: ConversationSearchMode;
  onShowLocatedWindow: (result: ConversationLocateResult) => void;
  providerId: ProviderId | null;
  sessionId: string | null;
  visibleMessages: ConversationMessage[];
}) {
  const {
    mode,
    onShowLocatedWindow,
    providerId,
    sessionId,
    visibleMessages,
  } = props;
  const [scope, setScope] = useState<ConversationSearchScope>("current");
  const [query, setQuery] = useState("");
  const [currentState, setCurrentState] = useState(() => createEmptyCurrentSearchState(mode));
  const [allState, setAllState] = useState(() => createEmptyAllSearchState(mode));
  const [error, setError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const requestVersionRef = useRef(0);
  const activeCurrentHitRef = useRef<ConversationSearchHit | null>(null);

  activeCurrentHitRef.current = readHitAtIndex(
    currentState.result,
    currentState.activeHitIndex,
  );

  useEffect(() => {
    requestVersionRef.current += 1;
    setScope("current");
    setQuery("");
    setCurrentState(createEmptyCurrentSearchState(mode));
    setAllState(createEmptyAllSearchState(mode));
    setError(null);
    setSearchLoading(false);
    setContextLoading(false);
  }, [providerId, sessionId]);

  useEffect(() => {
    if (scope !== "current") {
      setCurrentState(createEmptyCurrentSearchState(mode));
      return;
    }
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setCurrentState(createEmptyCurrentSearchState(mode));
      setError(null);
      return;
    }
    const nextResult = buildCurrentSearchResult(
      visibleMessages,
      normalizedQuery,
      mode,
      RECENT_SEARCH_MESSAGE_LIMIT,
    );
    const nextIndex = resolvePreferredSearchHitIndex(nextResult, activeCurrentHitRef.current);
    setCurrentState({
      activeHitIndex: nextIndex,
      activeMessageId: readCurrentActiveMessageId(nextResult, nextIndex),
      result: nextResult,
    });
    setError(null);
  }, [mode, query, scope, visibleMessages]);

  useEffect(() => {
    if (scope !== "all") {
      setAllState(createEmptyAllSearchState(mode));
      return;
    }
    const normalizedQuery = query.trim();
    if (!providerId || !sessionId || !normalizedQuery) {
      setAllState(createEmptyAllSearchState(mode));
      setError(null);
      setSearchLoading(false);
      return;
    }
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setSearchLoading(true);
    setError(null);
    setAllState((current) => ({
      ...current,
      activeHitIndex: -1,
      activeMessageId: null,
      hits: [],
      page: createEmptySearchPage(normalizedQuery, mode),
      showingResultsPage: true,
    }));
    searchConversationMessagePage(
      providerId,
      sessionId,
      normalizedQuery,
      mode,
      null,
      ALL_SEARCH_RESULT_LIMIT,
      RECENT_SEARCH_MESSAGE_LIMIT,
    )
      .then((page) => {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        setAllState({
          activeHitIndex: page.hits.length > 0 ? 0 : -1,
          activeMessageId: page.hits[0]?.messageId ?? null,
          hits: page.hits,
          page,
          showingResultsPage: true,
        });
      })
      .catch(() => {
        if (requestVersion !== requestVersionRef.current) {
          return;
        }
        setAllState(createEmptyAllSearchState(mode));
        setError(SEARCH_ERROR_MESSAGE);
      })
      .finally(() => {
        if (requestVersion === requestVersionRef.current) {
          setSearchLoading(false);
        }
      });
  }, [mode, providerId, query, scope, sessionId]);

  const clearSearch = useCallback(() => {
    requestVersionRef.current += 1;
    setQuery("");
    setCurrentState(createEmptyCurrentSearchState(mode));
    setAllState(createEmptyAllSearchState(mode));
    setError(null);
    setSearchLoading(false);
    setContextLoading(false);
  }, [mode]);

  const openAllSearchHit = useCallback(async (hit: ConversationSearchHit) => {
    if (!providerId || !sessionId) {
      return false;
    }
    setContextLoading(true);
    try {
      const context = await readConversationMessageContext(
        providerId,
        sessionId,
        hit.anchor,
        mode,
        SEARCH_CONTEXT_WINDOW_SIZE,
      );
      if (!context) {
        throw new Error("Search context not found");
      }
      onShowLocatedWindow(toLocateWindow(context));
      const hitIndex = allState.hits.findIndex((item) => item.messageId === hit.messageId);
      setAllState((current) => ({
        ...current,
        activeHitIndex: hitIndex >= 0 ? hitIndex : current.activeHitIndex,
        activeMessageId: hit.messageId,
        showingResultsPage: false,
      }));
      setError(null);
      return true;
    } catch {
      setError(SEARCH_CONTEXT_ERROR_MESSAGE);
      return false;
    } finally {
      setContextLoading(false);
    }
  }, [mode, onShowLocatedWindow, providerId, sessionId]);

  const goToCurrentHit = useCallback((direction: 1 | -1) => {
    const nextIndex = getWrappedSearchHitIndex(
      currentState.activeHitIndex,
      currentState.result.hits.length,
      direction,
    );
    setCurrentState((current) => ({
      ...current,
      activeHitIndex: nextIndex,
      activeMessageId: readCurrentActiveMessageId(current.result, nextIndex),
    }));
    return nextIndex >= 0;
  }, [currentState.activeHitIndex, currentState.result]);

  const goToAllHit = useCallback(async (direction: 1 | -1) => {
    const nextIndex = getWrappedSearchHitIndex(
      allState.activeHitIndex,
      allState.hits.length,
      direction,
    );
    if (nextIndex < 0) {
      return false;
    }
    const hit = allState.hits[nextIndex] ?? null;
    if (!hit) {
      return false;
    }
    setAllState((current) => ({
      ...current,
      activeHitIndex: nextIndex,
      activeMessageId: hit.messageId,
      showingResultsPage: true,
    }));
    setError(null);
    return true;
  }, [allState.activeHitIndex, allState.hits]);

  const goToAllContextHit = useCallback(async (direction: 1 | -1) => {
    const nextIndex = getWrappedSearchHitIndex(
      allState.activeHitIndex,
      allState.hits.length,
      direction,
    );
    if (nextIndex < 0) {
      return false;
    }
    const hit = allState.hits[nextIndex] ?? null;
    if (!hit) {
      return false;
    }
    return openAllSearchHit(hit);
  }, [allState.activeHitIndex, allState.hits, openAllSearchHit]);

  const matchedMessageIds = useMemo(() => {
    if (scope === "current") {
      return readCurrentMatchedMessageIds(currentState.result);
    }
    return allState.activeMessageId ? new Set([allState.activeMessageId]) : new Set<string>();
  }, [allState.activeMessageId, currentState.result, scope]);

  return {
    activeHitIndex: scope === "current" ? currentState.activeHitIndex : allState.activeHitIndex,
    activeMessageId: scope === "current" ? currentState.activeMessageId : allState.activeMessageId,
    clearSearch,
    contextLoading,
    error,
    goToNextHit: useCallback(async () => {
      if (scope === "current") {
        return goToCurrentHit(1);
      }
      if (!allState.showingResultsPage) {
        return goToAllContextHit(1);
      }
      return goToAllHit(1);
    }, [allState.showingResultsPage, goToAllContextHit, goToAllHit, goToCurrentHit, scope]),
    goToPreviousHit: useCallback(async () => {
      if (scope === "current") {
        return goToCurrentHit(-1);
      }
      if (!allState.showingResultsPage) {
        return goToAllContextHit(-1);
      }
      return goToAllHit(-1);
    }, [allState.showingResultsPage, goToAllContextHit, goToAllHit, goToCurrentHit, scope]),
    hasMoreAllHits: false,
    loading: searchLoading || contextLoading,
    matchedMessageIds,
    openAllSearchHit,
    query,
    reopenAllSearchResults: useCallback(() => {
      setAllState((current) => ({
        ...current,
        showingResultsPage: true,
      }));
    }, []),
    scope,
    searchPageCountLabel: readSearchPageResultCountLabel({
      activeHitIndex: allState.activeHitIndex,
      totalHits: allState.page.totalHits,
      visibleHits: allState.hits.length,
    }),
    searchPageHits: allState.hits,
    searchPageTotalHits: allState.page.totalHits,
    setQuery,
    setScope,
    showSearchResultsPage: scope === "all" && allState.showingResultsPage,
    statusLabel: scope === "current"
      ? readSearchPageResultCountLabel({
          activeHitIndex: currentState.activeHitIndex,
          totalHits: currentState.result.totalHits,
        })
      : readSearchPageResultCountLabel({
          activeHitIndex: allState.activeHitIndex,
          totalHits: allState.page.totalHits,
          visibleHits: allState.hits.length,
        }),
  };
}
