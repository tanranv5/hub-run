import { memo, useEffect, useRef, useState } from "react";
import type {
  ConversationMessage,
  ConversationSearchMode,
  ProviderUserInputRequest,
} from "../../api/types";
import {
  createConversationTimelineResetToken,
  isNearConversationBottom,
} from "../conversation-scroll-state";
import {
  ConversationMessageCard,
  SummaryBanner,
} from "./conversation-message";
import ScrollToLatestButton from "./scroll-to-latest-button";

interface ConversationTimelineProps {
  activeSearchMessageId?: string | null;
  error: string | null;
  hasOlderMessages: boolean;
  hasBufferedLatest: boolean;
  highlightQuery?: string;
  loading: boolean;
  loadingOlder: boolean;
  messageWindowFrozen: boolean;
  messageFontScale?: number;
  messageViewMode?: ConversationSearchMode;
  messages: ConversationMessage[];
  matchedSearchMessageIds?: ReadonlySet<string>;
  olderLoadCount?: number;
  onBrowseMessages?: () => void;
  pendingUserInputRequests: ProviderUserInputRequest[];
  respondingRequestId: string | null;
  sessionId?: string | null;
  summary: ConversationMessage | null;
  onLoadOlder: () => void;
  onLoadOlderToStart?: () => void;
  onSetMessageWindowFrozen: (frozen: boolean) => void;
  onRespondUserInput: (
    request: ProviderUserInputRequest,
    questionId: string,
    optionLabel: string,
  ) => void;
  onViewLatest: () => void;
}

const LOAD_TO_START_THRESHOLD = 10;

export default memo(function ConversationTimeline(props: ConversationTimelineProps) {
  const {
    activeSearchMessageId = null,
    error,
    hasOlderMessages,
    hasBufferedLatest,
    highlightQuery = "",
    loading,
    loadingOlder,
    matchedSearchMessageIds = new Set<string>(),
    messageWindowFrozen,
    messageFontScale = 4,
    messageViewMode = "all",
    messages,
    olderLoadCount = 0,
    onBrowseMessages,
    pendingUserInputRequests,
    respondingRequestId,
    sessionId = null,
    summary,
    onLoadOlder,
    onLoadOlderToStart,
    onSetMessageWindowFrozen,
    onRespondUserInput,
    onViewLatest,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const latestAnchorRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollingRef = useRef(false);
  const [pinnedToLatest, setPinnedToLatest] = useState(true);
  const resetToken = createConversationTimelineResetToken(
    sessionId,
    summary?.id ?? null,
  );
  const shouldShowLoadToStart =
    hasOlderMessages &&
    typeof onLoadOlderToStart === "function" &&
    olderLoadCount > LOAD_TO_START_THRESHOLD;

  useEffect(() => {
    setPinnedToLatest(true);
  }, [resetToken]);

  useEffect(() => {
    if (loading || messages.length === 0 || !pinnedToLatest) {
      return;
    }

    if (!latestAnchorRef.current) {
      return;
    }

    scrollingRef.current = true;
    latestAnchorRef.current.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollingRef.current = false;
      });
    });
  }, [loading, messages, pinnedToLatest]);

  useEffect(() => {
    if (!activeSearchMessageId) {
      return;
    }
    const element = messageRefs.current.get(activeSearchMessageId);
    if (!element) {
      return;
    }
    scrollingRef.current = true;
    setPinnedToLatest(false);
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    setTimeout(() => {
      scrollingRef.current = false;
    }, 250);
  }, [activeSearchMessageId, messages]);

  function syncPinnedState() {
    if (!containerRef.current || scrollingRef.current) {
      return;
    }

    onBrowseMessages?.();
    const nextPinned = isNearConversationBottom({
      clientHeight: containerRef.current.clientHeight,
      scrollHeight: containerRef.current.scrollHeight,
      scrollTop: containerRef.current.scrollTop,
    });
    setPinnedToLatest(nextPinned);
    if (!nextPinned) {
      onSetMessageWindowFrozen(true);
      return;
    }
    if (messageWindowFrozen && !hasBufferedLatest) {
      onSetMessageWindowFrozen(false);
    }
  }

  function handleJumpToLatest() {
    if (!latestAnchorRef.current) {
      return;
    }

    onViewLatest();
    setPinnedToLatest(true);
    scrollingRef.current = true;
    latestAnchorRef.current.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
    setTimeout(() => {
      scrollingRef.current = false;
    }, 350);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        onScroll={syncPinnedState}
        className="h-full overflow-y-auto px-4 pb-4 pt-16 md:px-6 md:pb-6 md:pt-[4.5rem]"
      >
        <div className="space-y-4">
          {hasOlderMessages ? (
            <div className="flex justify-center pb-2">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onLoadOlder}
                  disabled={loadingOlder}
                  className="rounded-full bg-surface px-4 py-2 text-xs font-medium text-muted transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingOlder ? "加载中..." : "加载更多历史数据"}
                </button>
                {shouldShowLoadToStart ? (
                  <button
                    type="button"
                    onClick={onLoadOlderToStart}
                    disabled={loadingOlder}
                    className="rounded-full border border-bdr bg-panel px-4 py-2 text-xs font-medium text-txt transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    加载到首条
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <SummaryBanner summary={summary} />
          {pendingUserInputRequests.map((request) => (
            <div
              key={request.requestId}
              className="rounded-2xl border border-amber-400/20 bg-amber-400/8 px-4 py-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300 opacity-80">
                    User Input
                  </p>
                  <p className="mt-1 text-xs text-amber-50/80">
                    {request.turnId}
                  </p>
                </div>
                {respondingRequestId === request.requestId ? (
                  <span className="text-xs text-amber-700 dark:text-amber-300">提交中...</span>
                ) : null}
              </div>
              <div className="space-y-3">
                {request.questions.map((question) => (
                  <div key={question.id} className="rounded-2xl border border-amber-400/20 bg-surface p-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-amber-700/80 dark:text-amber-100/80">
                      {question.header}
                    </p>
                    <p className="mt-2 text-sm text-amber-50">{question.question}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {question.options.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          disabled={respondingRequestId === request.requestId}
                          onClick={() => onRespondUserInput(request, question.id, option.label)}
                          className="rounded-full border border-amber-200/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-50 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {error ? (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="py-4 text-center text-sm text-muted">正在加载记录...</div>
          ) : null}
          {!loading && messages.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted">
              该会话当前没有可渲染消息。
            </div>
          ) : null}
          {messages.map((message, index) => {
            const searchState = activeSearchMessageId === message.id
              ? "active"
              : (matchedSearchMessageIds.has(message.id) ? "match" : "none");
            return (
              <div
                key={message.id}
                data-message-id={message.id}
                ref={(node) => {
                  if (node) {
                    messageRefs.current.set(message.id, node);
                    return;
                  }
                  messageRefs.current.delete(message.id);
                }}
              >
                <ConversationMessageCard
                  fontScale={messageFontScale}
                  highlightQuery={highlightQuery}
                  message={message}
                  previousMessage={messages[index - 1] ?? null}
                  renderMode={messageViewMode}
                  searchState={searchState}
                />
              </div>
            );
          })}
          <div ref={latestAnchorRef} />
        </div>
      </div>
      {!pinnedToLatest && messages.length > 0 ? (
        <ScrollToLatestButton onClick={handleJumpToLatest} />
      ) : null}
      {pinnedToLatest && hasBufferedLatest ? (
        <ScrollToLatestButton onClick={handleJumpToLatest} />
      ) : null}
    </div>
  );
});
