import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionSummary } from "../../api/types";
import {
  computeVirtualWindow,
  getScrollTopToRevealIndex,
  getSessionTitle,
  SESSION_GROUP_HEADER_HEIGHT,
  SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT,
  SESSION_LIST_ITEM_HEIGHT,
  SESSION_LIST_OVERSCAN,
} from "../session-browser-state";
import { formatTime } from "../utils";

type FlatItem =
  | { kind: "header"; projectName: string; key: string }
  | { kind: "session"; session: SessionSummary };

function buildFlatItems(sessions: SessionSummary[]): FlatItem[] {
  const projects = new Map<string, SessionSummary[]>();
  for (const session of sessions) {
    const key = session.projectName || session.project || "";
    const group = projects.get(key) ?? [];
    group.push(session);
    projects.set(key, group);
  }
  if (projects.size <= 1) {
    return sessions.map((session) => ({ kind: "session" as const, session }));
  }
  const items: FlatItem[] = [];
  for (const [projectName, group] of projects) {
    items.push({ kind: "header", projectName, key: `header:${projectName}` });
    for (const session of group) {
      items.push({ kind: "session", session });
    }
  }
  return items;
}

function getItemHeight(item: FlatItem): number {
  return item.kind === "header" ? SESSION_GROUP_HEADER_HEIGHT : SESSION_LIST_ITEM_HEIGHT;
}

interface SessionBrowserListProps {
  disabled?: boolean;
  sessions: SessionSummary[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
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
  onDeleteSession?: (sessionId: string) => void;
}) {
  const { active, disabled = false, session, onSelectSession, onDeleteSession } = props;
  const title = getSessionTitle(session.display);
  const [confirming, setConfirming] = useState(false);

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(true);
  }

  function handleConfirmDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(false);
    onDeleteSession?.(session.id);
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(false);
  }

  return (
    <div className="relative mb-1 last:mb-0 [&:hover_.delete-btn]:opacity-100">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectSession(session.id)}
        className={`group block h-[72px] w-full rounded-lg px-3 py-3 text-left transition ${
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
    {onDeleteSession && !confirming && (
      <button
        type="button"
        onClick={handleDeleteClick}
        className="delete-btn absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded p-1 text-muted opacity-0 transition hover:text-red-500"
        title="删除会话"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
    )}
    {confirming && (
      <div className="absolute inset-0 z-10 flex items-center gap-2 rounded-lg bg-surface-hover/95 px-3 backdrop-blur-sm">
        <span className="flex-1 truncate text-xs text-txt">删除「{getSessionTitle(session.display)}」？</span>
        <button
          type="button"
          onClick={handleConfirmDelete}
          className="shrink-0 rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
        >
          删除
        </button>
        <button
          type="button"
          onClick={handleCancelDelete}
          className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-surface"
        >
          取消
        </button>
      </div>
    )}
  </div>
  );
}

export function SessionBrowserList(props: SessionBrowserListProps) {
  const { disabled = false, sessions, selectedSessionId, onSelectSession, onDeleteSession } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(
    SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT,
  );
  const viewportHeight = containerHeight || SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT;

  const flatItems = useMemo(() => buildFlatItems(sessions), [sessions]);
  const isGrouped = flatItems.some((item) => item.kind === "header");

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
    if (!element || !selectedSessionId || isGrouped) {
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
  }, [selectedSessionId, sessions, viewportHeight, isGrouped]);

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
      data-virtualized={isGrouped ? undefined : "true"}
      className="flex-1 overflow-y-auto pr-1"
      onScroll={handleScroll}
    >
      {isGrouped ? (
        flatItems.map((item) =>
          item.kind === "header" ? (
            <div
              key={item.key}
              style={{ height: `${SESSION_GROUP_HEADER_HEIGHT}px` }}
              className="flex items-center px-2 text-xs uppercase tracking-wide text-muted"
            >
              {item.projectName || "(无项目)"}
            </div>
          ) : (
            <SessionRow
              key={item.session.id}
              active={item.session.id === selectedSessionId}
              disabled={disabled}
              session={item.session}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
            />
          )
        )
      ) : (
        <>
          {range.paddingTop > 0 ? <div style={{ height: `${range.paddingTop}px` }} /> : null}
          {visibleSessions.map((session) => (
            <SessionRow
              key={session.id}
              active={session.id === selectedSessionId}
              disabled={disabled}
              session={session}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
            />
          ))}
          {range.paddingBottom > 0 ? <div style={{ height: `${range.paddingBottom}px` }} /> : null}
        </>
      )}
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
