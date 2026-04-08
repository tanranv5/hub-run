import { Check, ChevronDown, ChevronUp, Copy, PanelLeft, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SessionSummary } from "../../api/types";
import type { ConversationSearchScope } from "../conversation-panel-search";
import type { ConversationStatus } from "../conversation-status";
import { getSessionTitle } from "../session-browser-state";
import { formatTime } from "../utils";
import ConversationSessionStatus from "./conversation-session-status";

const COPY_TOOLTIP_LABEL = "复制会话 ID";
const COPIED_TOOLTIP_LABEL = "已复制会话 ID";

function SearchScopeIcon(props: { scope: ConversationSearchScope }) {
  const { scope } = props;
  if (scope === "all") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-1.8">
        <path d="M4 6h7" />
        <path d="M4 10h6" />
        <path d="M4 14h7" />
        <circle cx="14.5" cy="10" r="2.5" />
        <path d="m16.5 12 1.5 1.5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-1.8">
      <circle cx="9" cy="9" r="4" />
      <path d="m12 12 3 3" />
      <path d="M9 3.5v2" />
      <path d="M9 12.5v2" />
      <path d="M3.5 9h2" />
      <path d="M12.5 9h2" />
    </svg>
  );
}

interface ConversationHeaderProps {
  collapsed?: boolean;
  conversationStatus: ConversationStatus;
  searchActiveIndex?: number;
  searchError?: string | null;
  searchLoading?: boolean;
  searchOpen?: boolean;
  searchQuery?: string;
  searchScope?: ConversationSearchScope;
  searchStatusLabel?: string;
  onCloseSearch?: () => void;
  onEscSearch?: () => void;
  onNextSearchHit?: () => void;
  onPreviousSearchHit?: () => void;
  onSearchQueryChange?: (value: string) => void;
  onSearchScopeChange?: (scope: ConversationSearchScope) => void;
  onToggleCollapsed?: () => void;
  onToggleSearch?: () => void;
  session: SessionSummary;
  onToggleDesktopSidebar: () => void;
}

export default function ConversationHeader(props: ConversationHeaderProps) {
  const {
    collapsed = false,
    conversationStatus,
    session,
    onToggleDesktopSidebar,
    searchActiveIndex = -1,
    searchError = null,
    searchLoading = false,
    searchOpen = false,
    searchQuery = "",
    searchScope = "current",
    searchStatusLabel = "0/0",
    onCloseSearch,
    onEscSearch,
    onNextSearchHit,
    onPreviousSearchHit,
    onSearchQueryChange,
    onSearchScopeChange,
    onToggleCollapsed,
    onToggleSearch,
  } = props;
  const [copied, setCopied] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const title = getSessionTitle(session.display);
  const projectLabel = session.projectName || session.project;
  const relativeTime = formatTime(session.timestamp);
  const searchPlaceholder = searchScope === "all" ? "搜索全部历史" : "搜索当前页面";
  const searchNavigationDisabled = searchLoading || searchStatusLabel.startsWith("0/0");

  useEffect(() => {
    function handleGlobalKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (collapsed) return;
        if (!searchOpen && onToggleSearch) {
          onToggleSearch();
        } else if (searchOpen) {
          searchInputRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [collapsed, onToggleSearch, searchOpen]);

  async function handleCopySessionId() {
    if (!navigator.clipboard) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(session.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (collapsed) {
    return (
      <div
        data-slot="conversation-header-collapsed"
        className="flex-none border-b border-bdr px-3 py-1.5 md:px-6 md:py-2"
      >
        <div className="flex items-center gap-2">
          <ConversationSessionStatus conversationStatus={conversationStatus} />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-txt">
            {title}
          </h2>
          {onToggleCollapsed ? (
            <button
              type="button"
              aria-label="展开标题栏"
              data-slot="conversation-header-collapse-control"
              onClick={onToggleCollapsed}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bdr bg-surface text-muted transition hover:bg-surface-hover"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-none border-b border-bdr px-3 py-2 md:px-6 md:py-4">
      <div className="flex items-start gap-2 md:items-center md:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <button
            type="button"
            onClick={onToggleDesktopSidebar}
            className="hidden h-8 w-8 items-center justify-center rounded-md border border-bdr bg-surface text-txt transition hover:bg-surface-hover lg:inline-flex"
            aria-label="切换侧边栏"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div data-region="conversation-header-meta" className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-txt md:text-lg">
              {title}
            </h2>
            <p className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
                <span className="truncate">{projectLabel}</span>
                <span className="shrink-0">{relativeTime}</span>
              </span>
                <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 md:gap-2">
                <button
                  type="button"
                  aria-label="搜索当前会话"
                  onClick={onToggleSearch}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-bdr bg-surface text-muted transition hover:bg-surface-hover"
                  data-slot="conversation-search-toggle"
                >
                  <Search className="h-4 w-4" />
                </button>
                <span className="hidden group relative md:inline-flex">
                  <button
                    type="button"
                    aria-label={COPY_TOOLTIP_LABEL}
                    onClick={() => {
                      handleCopySessionId().catch(console.error);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-bdr bg-surface text-muted transition hover:bg-surface-hover"
                  >
                    {copied ? <Check className="h-4 w-4 text-accent-2" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <span
                    data-slot="session-copy-tooltip"
                    role="tooltip"
                    className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-bdr bg-panel px-3 py-2 text-left text-[11px] leading-5 text-txt shadow-lg shadow-black/10 dark:shadow-black/30 group-hover:block group-focus-within:block"
                  >
                    <span className="block font-medium text-txt">
                      {copied ? COPIED_TOOLTIP_LABEL : COPY_TOOLTIP_LABEL}
                    </span>
                    <span className="mt-1 block break-all font-mono text-muted">
                      {session.id}
                    </span>
                  </span>
                </span>
                {onToggleCollapsed ? (
                  <button
                    type="button"
                    aria-label="隐藏标题栏"
                    data-slot="conversation-header-collapse-control"
                    onClick={onToggleCollapsed}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-bdr bg-surface text-muted transition hover:bg-surface-hover"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                ) : null}
                <div className="flex-none max-w-[120px] md:max-w-none">
                  <ConversationSessionStatus
                    conversationStatus={conversationStatus}
                  />
                </div>
              </span>
            </p>
            {searchOpen ? (
              <div
                data-slot="conversation-search-bar"
                className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-bdr bg-surface/80 px-3 py-2"
              >
                <Search className="h-4 w-4 text-muted" />
                <input
                  ref={searchInputRef}
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange?.(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      if (onEscSearch) {
                        onEscSearch();
                      } else {
                        onCloseSearch?.();
                      }
                    } else if (event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)) {
                      event.preventDefault();
                      onNextSearchHit?.();
                    } else if (event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)) {
                      event.preventDefault();
                      onPreviousSearchHit?.();
                    }
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="min-w-[10rem] flex-1 bg-transparent text-sm text-txt outline-none placeholder:text-muted"
                />
                <div className="inline-flex items-center gap-1 rounded-full border border-bdr bg-panel p-1 text-[11px] text-muted">
                  <button
                    type="button"
                    aria-label="搜索当前页面"
                    onClick={() => onSearchScopeChange?.("current")}
                    data-slot="conversation-search-scope-current"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
                      searchScope === "current" ? "bg-surface text-txt" : ""
                    }`}
                  >
                    <SearchScopeIcon scope="current" />
                  </button>
                  <button
                    type="button"
                    aria-label="搜索全部历史"
                    onClick={() => onSearchScopeChange?.("all")}
                    data-slot="conversation-search-scope-all"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
                      searchScope === "all" ? "bg-surface text-txt" : ""
                    }`}
                  >
                    <SearchScopeIcon scope="all" />
                  </button>
                </div>
                <span
                  data-slot="conversation-search-count"
                  className="rounded-full border border-bdr px-2 py-1 text-[11px] text-muted"
                >
                  {searchLoading ? "搜索中..." : searchStatusLabel}
                </span>
                <button
                  type="button"
                  aria-label="上一个命中"
                  onClick={onPreviousSearchHit}
                  disabled={searchNavigationDisabled}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-bdr bg-panel text-muted transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="下一个命中"
                  onClick={onNextSearchHit}
                  disabled={searchNavigationDisabled}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-bdr bg-panel text-muted transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="关闭搜索"
                  onClick={onCloseSearch}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-bdr bg-panel text-muted transition hover:bg-surface-hover"
                >
                  <X className="h-4 w-4" />
                </button>
                {searchError ? (
                  <span className="ml-1 text-xs text-rose-600 dark:text-rose-300">
                    {searchError}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
