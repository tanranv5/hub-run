import { formatConversationTimestamp } from "../utils";

export function ConversationTimestamp(props: {
  className?: string;
  timestamp?: string;
}) {
  const { className = "text-muted", timestamp } = props;
  const display = formatConversationTimestamp(timestamp);
  if (!display) {
    return null;
  }

  return (
    <div
      data-slot="message-timestamp"
      className={`mt-3 flex justify-end text-[11px] leading-none ${className}`}
      title={timestamp}
    >
      {display}
    </div>
  );
}
