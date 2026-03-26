import { useEffect, useState } from "react";
import { ConversationTimestamp } from "./conversation-timestamp";
import { MarkdownRenderer, getFencedCodeBlock } from "./markdown-renderer";

export function ConversationExpandableCard(props: {
  badge: string;
  collapsedLabel: string;
  expandedLabel: string;
  messageId: string;
  subtitle: string;
  timestamp?: string;
  text: string;
  tone: "amber" | "rose";
}) {
  const { badge, collapsedLabel, expandedLabel, messageId, subtitle, text, timestamp, tone } = props;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [messageId]);

  return (
    <article className="mx-auto max-w-full">
      <div className={`rounded-[22px] border px-3 py-3 shadow-lg shadow-slate-950/15 md:rounded-[26px] md:px-4 md:py-4 ${getToneClass(tone)}`}>
        <button
          aria-expanded={expanded}
          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left ${getToneButtonClass(tone)}`}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] md:text-[11px]">
            <span>{badge}</span>
            <span className="opacity-30">/</span>
            <span>{subtitle}</span>
          </span>
          <span className="text-[11px]">{expanded ? expandedLabel : collapsedLabel}</span>
        </button>
        {expanded ? (
          <div className={`mt-3 rounded-2xl border px-3 py-3 ${getToneBodyClass(tone)}`}>
            <MarkdownRenderer content={formatExpandableText(text)} />
          </div>
        ) : null}
        <ConversationTimestamp
          className={tone === "amber" ? "text-amber-700/55 dark:text-amber-100/55" : "text-rose-700/55 dark:text-rose-100/55"}
          timestamp={timestamp}
        />
      </div>
    </article>
  );
}

function formatExpandableText(text: string): string {
  return text.includes("```") ? text : getFencedCodeBlock(text, "text");
}

function getToneClass(tone: "amber" | "rose"): string {
  return tone === "amber"
    ? "border-amber-400/20 bg-amber-400/7 text-amber-50"
    : "border-rose-400/20 bg-rose-400/10 text-rose-50";
}

function getToneButtonClass(tone: "amber" | "rose"): string {
  return tone === "amber"
    ? "border-amber-200/10 bg-slate-950/20 text-amber-700/80 dark:text-amber-100/80"
    : "border-rose-200/10 bg-slate-950/20 text-rose-700/80 dark:text-rose-100/80";
}

function getToneBodyClass(tone: "amber" | "rose"): string {
  return tone === "amber"
    ? "border-amber-200/10 bg-slate-950/25"
    : "border-rose-200/10 bg-slate-950/25";
}
