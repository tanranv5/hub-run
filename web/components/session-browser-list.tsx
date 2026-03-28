import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionSummary } from "../../api/types";
import {
  computeVirtualWindow,
  getScrollTopToRevealIndex,
  getSessionTitle,
  SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT,
  SESSION_LIST_ITEM_HEIGHT,
  SESSION_LIST_OVERSCAN,
} from "../session-browser-state";
import { formatTime } from "../utils";

interface SessionBrowserListProps {
  disabled?: boolean;
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

interface LoadMoreButtonProps {
  disabled?: boolean;
  loadingMore: boolean;
  nextBefore: string | null;
  onLoadMore: () => void;
}

function readViewportHeight(element: HTMLDivElement | null): number {
  if (!element) {
    return SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT;
  }
  return element.clientHeight || SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT;
}

function SessionRow(props: {
  active: boolean;
  disabled?: boolean;
  session: SessionSummary;
  onSelectSession: (sessionId: string) => void;
}) {
  const { active, disabled = false, session, onSelectSession } = props;
  const title = getSessionTitle(session.display);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelectSession(session.id)}
      className={`group mb-1 block h-[72px] w-full rounded-lg px-3 py-3 text-left transition last:mb-0 ${
        active ? "bg-surface-hover" : "bg-transparent hover:bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-txt group-hover:text-accent">
              {title}
            </span>
            {active ? (
              <span className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700">
                进行中
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span className="truncate">{session.projectName || "未命名项目"}</span>
            <span className="text-muted">•</span>
            <span className="shrink-0">{formatTime(session.timestamp)}</span>
          </div>
        </div>
        <span className="hidden shrink-0 text-xs text-muted xl:inline">
          {formatTime(session.timestamp)}
        </span>
      </div>
    </button>
  );
}

export function SessionBrowserList(props: SessionBrowserListProps) {
  const { disabled = false, sessions, selectedSessionId, onSelectSession } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(
    SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT,
  );
  const viewportHeight = containerHeight || SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT;
  const range = useMemo(
    () => computeVirtualWindow({
      itemCount: sessions.length,
      itemHeight: SESSION_LIST_ITEM_HEIGHT,
      containerHeight: viewportHeight,
      overscan: SESSION_LIST_OVERSCAN,
      scrollTop,
    }),
    [sessions.length, scrollTop, viewportHeight],
  );
  const visibleSessions = sessions.slice(range.startIndex, range.endIndex);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    setContainerHeight(readViewportHeight(element));
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      setContainerHeight(readViewportHeight(element));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || !selectedSessionId) {
      return;
    }
    const index = sessions.findIndex((session) => session.id === selectedSessionId);
    if (index < 0) {
      return;
    }
    const nextScrollTop = getScrollTopToRevealIndex({
      currentScrollTop: element.scrollTop,
      containerHeight: viewportHeight,
      itemHeight: SESSION_LIST_ITEM_HEIGHT,
      index,
    });
    if (nextScrollTop === element.scrollTop) {
      return;
    }
    element.scrollTop = nextScrollTop;
    setScrollTop(nextScrollTop);
  }, [selectedSessionId, sessions, viewportHeight]);

  function handleScroll() {
    if (rafRef.current) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!containerRef.current) {
        return;
      }
      setScrollTop(containerRef.current.scrollTop);
      setContainerHeight(readViewportHeight(containerRef.current));
    });
  }

  return (
    <div
      ref={containerRef}
      data-virtualized="true"
      className="flex-1 overflow-y-auto pr-1"
      onScroll={handleScroll}
    >
      {range.paddingTop > 0 ? <div style={{ height: `${range.paddingTop}px` }} /> : null}
      {visibleSessions.map((session) => (
        <SessionRow
          key={session.id}
          active={session.id === selectedSessionId}
          disabled={disabled}
          session={session}
          onSelectSession={onSelectSession}
        />
      ))}
      {range.paddingBottom > 0 ? <div style={{ height: `${range.paddingBottom}px` }} /> : null}
    </div>
  );
}

export function LoadMoreButton(props: LoadMoreButtonProps) {
  const { disabled = false, loadingMore, nextBefore, onLoadMore } = props;

  if (!nextBefore) {
    return null;
  }

  return (
    <div className="mt-auto pb-1 pt-3">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loadingMore || disabled}
        className="w-full rounded-lg border border-bdr bg-surface py-2.5 text-sm text-muted transition hover:bg-surface-hover hover:text-txt disabled:cursor-not-allowed disabled:text-muted"
      >
        {loadingMore ? "加载中..." : "加载更多历史"}
      </button>
    </div>
  );
}
