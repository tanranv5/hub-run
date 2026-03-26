import { memo, useEffect, useRef, useState } from "react";
import type {
  ConversationMessage,
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
  error: string | null;
  hasOlderMessages: boolean;
  hasBufferedLatest: boolean;
  loading: boolean;
  loadingOlder: boolean;
  messageWindowFrozen: boolean;
  messages: ConversationMessage[];
  pendingUserInputRequests: ProviderUserInputRequest[];
  respondingRequestId: string | null;
  sessionId?: string | null;
  summary: ConversationMessage | null;
  onLoadOlder: () => void;
  onSetMessageWindowFrozen: (frozen: boolean) => void;
  onRespondUserInput: (
    request: ProviderUserInputRequest,
    questionId: string,
    optionLabel: string,
  ) => void;
  onViewLatest: () => void;
}

export default memo(function ConversationTimeline(props: ConversationTimelineProps) {
  const {
    error,
    hasOlderMessages,
    hasBufferedLatest,
    loading,
    loadingOlder,
    messageWindowFrozen,
    messages,
    pendingUserInputRequests,
    respondingRequestId,
    sessionId = null,
    summary,
    onLoadOlder,
    onSetMessageWindowFrozen,
    onRespondUserInput,
    onViewLatest,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const latestAnchorRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const [pinnedToLatest, setPinnedToLatest] = useState(true);
  const resetToken = createConversationTimelineResetToken(
    sessionId,
    summary?.id ?? null,
  );

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

  function syncPinnedState() {
    if (!containerRef.current || scrollingRef.current) {
      return;
    }

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
        className="h-full overflow-y-auto px-4 py-4 md:px-6 md:py-6"
      >
        <div className="space-y-4">
          {hasOlderMessages ? (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={onLoadOlder}
                disabled={loadingOlder}
                className="rounded-full bg-surface px-4 py-2 text-xs font-medium text-muted transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingOlder ? "加载中..." : "加载更多历史数据"}
              </button>
            </div>
          ) : null}
          <SummaryBanner summary={summary} />
          {pendingUserInputRequests.map((request) => (
            <div
              key={request.requestId}
              className="rounded-[24px] border border-amber-400/20 bg-amber-400/8 px-4 py-4"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-amber-700/80 dark:text-amber-100/80">
                    User Input
                  </p>
                  <p className="mt-1 text-xs text-amber-50/80">
                    {request.turnId}
                  </p>
                </div>
                {respondingRequestId === request.requestId ? (
                  <span className="text-xs text-amber-700 dark:text-amber-100">提交中...</span>
                ) : null}
              </div>
              <div className="space-y-3">
                {request.questions.map((question) => (
                  <div key={question.id} className="rounded-2xl border border-amber-200/10 bg-slate-950/20 p-3">
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
          {messages.map((message, index) => (
            <ConversationMessageCard
              key={message.id}
              message={message}
              previousMessage={messages[index - 1] ?? null}
            />
          ))}
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
