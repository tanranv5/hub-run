import type { ConversationSearchMode } from "../../api/types";
import {
  MAX_MESSAGE_FONT_SCALE,
  MIN_MESSAGE_FONT_SCALE,
} from "../conversation-reading-styles";

interface ConversationReadingToolbarProps {
  fontScale: number;
  messageViewMode: ConversationSearchMode;
  onDecreaseFontScale: () => void;
  onIncreaseFontScale: () => void;
  onCycleMessageViewMode: () => void;
}

function MessageViewIcon(props: { mode: ConversationSearchMode }) {
  const { mode } = props;
  if (mode === "compact") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-1.8">
        <path d="M4 5.5h12" />
        <path d="M4 10h8" />
        <path d="M4 14.5h6" />
      </svg>
    );
  }
  if (mode === "text") {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-1.8">
        <path d="M5 5.5h10" />
        <path d="M10 5.5v9" />
        <path d="M7 14.5h6" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current stroke-1.8">
      <rect x="4" y="4" width="4.5" height="4.5" rx="1" />
      <rect x="11.5" y="4" width="4.5" height="4.5" rx="1" />
      <rect x="4" y="11.5" width="4.5" height="4.5" rx="1" />
      <rect x="11.5" y="11.5" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}

export function getConversationMessageViewLabel(
  mode: ConversationSearchMode,
): string {
  if (mode === "compact") {
    return "精简";
  }
  if (mode === "text") {
    return "纯文本";
  }
  return "全部";
}

export default function ConversationReadingToolbar(
  props: ConversationReadingToolbarProps,
) {
  const {
    fontScale,
    messageViewMode,
    onDecreaseFontScale,
    onIncreaseFontScale,
    onCycleMessageViewMode,
  } = props;
  const canDecreaseFontScale = fontScale > MIN_MESSAGE_FONT_SCALE;
  const canIncreaseFontScale = fontScale < MAX_MESSAGE_FONT_SCALE;

  return (
    <div
      data-slot="conversation-reading-toolbar"
      className="absolute right-4 top-3 z-10 flex items-center gap-2 rounded-xl border border-bdr bg-panel/95 px-2 py-2 shadow-sm backdrop-blur md:right-6 md:top-4"
    >
      <button
        type="button"
        onClick={onCycleMessageViewMode}
        aria-label={`消息模式：${getConversationMessageViewLabel(messageViewMode)}`}
        data-slot="conversation-reading-mode-toggle"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-bdr bg-surface text-txt transition hover:bg-surface-hover"
      >
        <MessageViewIcon mode={messageViewMode} />
      </button>
      <button
        type="button"
        onClick={onDecreaseFontScale}
        aria-label={`缩小消息字体，当前档位 ${fontScale}/6`}
        data-slot="conversation-reading-font-decrease"
        disabled={!canDecreaseFontScale}
        className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-bdr bg-surface px-2.5 text-sm font-semibold text-txt transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
      >
        A-
      </button>
      <button
        type="button"
        onClick={onIncreaseFontScale}
        aria-label={`放大消息字体，当前档位 ${fontScale}/6`}
        data-slot="conversation-reading-font-increase"
        disabled={!canIncreaseFontScale}
        className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-bdr bg-surface px-2.5 text-sm font-semibold text-txt transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
      >
        A+
      </button>
    </div>
  );
}
