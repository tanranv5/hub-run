import type { ConversationStatus, ConversationStatusTone } from "../conversation-status";

interface ConversationSessionStatusProps {
  conversationStatus: ConversationStatus;
}

export default function ConversationSessionStatus(
  props: ConversationSessionStatusProps,
) {
  const { conversationStatus } = props;

  if (conversationStatus.phase === "loading") {
    return (
      <span data-slot="conversation-session-status" className="inline-flex">
        <span
          aria-label="状态加载中"
          title="状态加载中"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full"
        >
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-slate-500" />
        </span>
      </span>
    );
  }

  const { label, tone } = conversationStatus;

  return (
    <span data-slot="conversation-session-status" className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full"
      >
        <span className={`h-2.5 w-2.5 rounded-full ${getToneClassName(tone)}`} />
      </button>
      <span className="pointer-events-none absolute left-5 top-1/2 z-10 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-bdr bg-panel px-2.5 py-1 text-[11px] text-txt shadow-lg shadow-black/10 dark:shadow-black/30 group-hover:flex group-focus-within:flex">
        {label}
      </span>
    </span>
  );
}

function getToneClassName(tone: ConversationStatusTone) {
  switch (tone) {
    case "neutral":
      return "bg-slate-400";
    case "active":
      return "bg-sky-400";
    case "success":
      return "bg-emerald-400";
    case "danger":
      return "bg-rose-400";
  }
}
