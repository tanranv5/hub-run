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
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-accent/80 md:text-[11px]">
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
          className={tone === "amber" ? "text-amber-700/55" : "text-rose-700/55"}
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
    ? "border-amber-400/30 bg-amber-400/10 text-amber-900"
    : "border-rose-400/30 bg-rose-400/15 text-rose-900";
}

function getToneButtonClass(tone: "amber" | "rose"): string {
  return tone === "amber"
    ? "border-amber-200/20 bg-surface text-amber-800"
    : "border-rose-200/20 bg-surface text-rose-800";
}

function getToneBodyClass(tone: "amber" | "rose"): string {
  return tone === "amber"
    ? "border-amber-200/10 bg-surface"
    : "border-rose-200/10 bg-surface";
}
