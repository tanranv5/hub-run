interface ConversationContextBadgeProps {
  details?: string | null;
  label: string;
}

export default function ConversationContextBadge(
  props: ConversationContextBadgeProps,
) {
  const { details = null, label } = props;

  return (
    <span
      data-slot="conversation-context-badge"
      className="group absolute bottom-3 left-3 z-10 inline-flex"
    >
      <button
        type="button"
        aria-label={details ? `当前上下文用量 ${label}，${details}` : `当前上下文用量 ${label}`}
        title={details ? `${label} (${details})` : label}
        className="inline-flex items-center rounded-full border border-accent-2/30 bg-accent-2/10 px-2 py-1 text-[10px] font-medium text-accent-2"
      >
        {label}
      </button>
      {details ? (
        <span className="pointer-events-none absolute bottom-full left-0 mb-1 hidden whitespace-nowrap rounded-md border border-bdr bg-panel px-2 py-1 text-[10px] text-txt shadow-lg shadow-black/10 dark:shadow-black/35 group-hover:block group-focus-within:block">
          {details}
        </span>
      ) : null}
    </span>
  );
}
