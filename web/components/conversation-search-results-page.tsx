import { useEffect, useRef } from "react";
import type { ConversationSearchHit } from "../../api/types";
import { ALL_SEARCH_RESULT_LIMIT } from "../conversation-panel-search";
import { getConversationFontScaleClasses } from "../conversation-reading-styles";
import { formatConversationTimestamp } from "../utils";

function getSearchHitRoleLabel(role: ConversationSearchHit["role"]): string {
  if (role === "assistant") {
    return "助手";
  }
  if (role === "user") {
    return "用户";
  }
  return "系统";
}

function getSearchHitKindLabel(kind: ConversationSearchHit["kind"]): string {
  if (kind === "text") {
    return "文本";
  }
  if (kind === "image") {
    return "图片";
  }
  if (kind === "thinking") {
    return "思考";
  }
  if (kind === "tool_use") {
    return "工具调用";
  }
  if (kind === "tool_result") {
    return "工具结果";
  }
  if (kind === "summary") {
    return "总结";
  }
  return "已中断";
}

function renderHighlightedPreview(hit: ConversationSearchHit) {
  if (hit.ranges.length === 0) {
    return hit.preview;
  }
  const nodes: (string | JSX.Element)[] = [];
  let cursor = 0;
  hit.ranges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(hit.preview.slice(cursor, range.start));
    }
    nodes.push(
      <mark
        key={`${hit.messageId}-${index}`}
        className="rounded bg-amber-300/40 px-0.5 text-inherit"
      >
        {hit.preview.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < hit.preview.length) {
    nodes.push(hit.preview.slice(cursor));
  }
  return nodes;
}

interface ConversationSearchResultsPageProps {
  activeHitIndex: number;
  activeMessageId: string | null;
  error: string | null;
  fontScale: number;
  hits: ConversationSearchHit[];
  loading: boolean;
  onOpenHit: (hit: ConversationSearchHit) => void;
  totalHits: number;
}

export default function ConversationSearchResultsPage(
  props: ConversationSearchResultsPageProps,
) {
  const {
    activeHitIndex,
    activeMessageId,
    error,
    fontScale,
    hits,
    loading,
    onOpenHit,
    totalHits,
  } = props;
  const classes = getConversationFontScaleClasses(fontScale);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);
  const showingLimitedSummary = totalHits > ALL_SEARCH_RESULT_LIMIT;
  const summaryLabel = showingLimitedSummary
    ? `共 ${totalHits} 条结果 · 当前显示前 ${ALL_SEARCH_RESULT_LIMIT} 条`
    : `共 ${totalHits} 条结果`;

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeHitIndex]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-none border-b border-bdr bg-surface/70 px-4 py-3 backdrop-blur md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-txt">
              全部历史搜索
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              点击结果查看上下文
              {showingLimitedSummary ? " · 仅展示前 100 条" : ""}
            </p>
          </div>
          <span className="rounded-lg border border-bdr bg-surface px-2.5 py-1 text-[11px] text-muted">
            {summaryLabel}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-5">
        <div className="flex flex-col gap-2">
          {error ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {error}
            </div>
          ) : null}
          {loading && hits.length === 0 ? (
            <div className="rounded-xl border border-bdr bg-surface/40 px-4 py-8 text-center text-sm text-muted">
              正在搜索历史消息...
            </div>
          ) : null}
          {!loading && hits.length === 0 ? (
            <div className="rounded-xl border border-dashed border-bdr bg-surface/40 px-4 py-8 text-center text-sm text-muted">
              当前没有搜索命中。
            </div>
          ) : null}
          {hits.map((hit, index) => {
            const active = index === activeHitIndex;
            return (
              <button
                key={`${hit.messageId}:${hit.anchor.offset}:${hit.anchor.blockIndex}`}
                ref={active ? activeItemRef : undefined}
                type="button"
                onClick={() => onOpenHit(hit)}
                className={`group rounded-xl border px-4 py-3 text-left transition hover:bg-surface-hover ${
                  active
                    ? "border-amber-400/50 bg-amber-400/8 ring-1 ring-amber-400/30"
                    : "border-bdr bg-panel/80"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted">
                  <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-accent/80">
                    {getSearchHitRoleLabel(hit.role)}
                  </span>
                  <span className="rounded-md bg-surface px-1.5 py-0.5">
                    {getSearchHitKindLabel(hit.kind)}
                  </span>
                  {hit.timestamp ? (
                    <span className="ml-auto" title={hit.timestamp}>
                      {formatConversationTimestamp(hit.timestamp) ?? hit.timestamp}
                    </span>
                  ) : null}
                </div>
                <div className={`${classes.textBody} line-clamp-3 whitespace-pre-wrap text-txt/90`}>
                  {renderHighlightedPreview(hit)}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
