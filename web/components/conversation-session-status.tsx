import type { ConversationStatus, ConversationStatusTone } from "../conversation-status";

interface ConversationSessionStatusProps {
  conversationStatus: ConversationStatus;
}

export default function ConversationSessionStatus(
  props: ConversationSessionStatusProps,
) {
  const { conversationStatus } = props;
  const label =
    conversationStatus.phase === "loading"
      ? "状态加载中"
      : conversationStatus.label;

  if (conversationStatus.phase === "loading") {
    return (
      <span data-slot="conversation-session-status" className="group relative inline-flex">
        <span
          aria-label={label}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full"
        >
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
        </span>
        <StatusTooltip label={label} />
      </span>
    );
  }

  const { tone } = conversationStatus;

  return (
    <span data-slot="conversation-session-status" className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full"
      >
        <span className={`h-2.5 w-2.5 rounded-full ${getToneClassName(tone)}`} />
      </button>
      <StatusTooltip label={label} />
    </span>
  );
}

function StatusTooltip(props: { label: string }) {
  const { label } = props;

  return (
    <span
      data-slot="conversation-session-status-tooltip"
      className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden max-w-[min(14rem,calc(100vw-2rem))] rounded-xl border border-bdr bg-panel px-3 py-2 text-left text-[11px] leading-5 text-txt shadow-lg shadow-black/20 group-hover:block group-focus-within:block"
    >
      <span className="block whitespace-normal break-words">{label}</span>
    </span>
  );
}

function getToneClassName(tone: ConversationStatusTone) {
  switch (tone) {
    case "neutral":
      return "bg-muted";
    case "active":
      return "bg-accent animate-pulse";
    case "success":
      return "bg-accent-2";
    case "danger":
      return "bg-danger";
  }
}
