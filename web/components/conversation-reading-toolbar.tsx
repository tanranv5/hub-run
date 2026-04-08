import type { ConversationSearchMode } from "../../api/types";
import {
  MAX_MESSAGE_FONT_SCALE,
  MIN_MESSAGE_FONT_SCALE,
} from "../conversation-reading-styles";

const READING_TOOLBAR_ICON_BUTTON_CLASS = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-bdr bg-surface text-txt transition hover:bg-surface-hover md:h-8 md:w-8";
const READING_TOOLBAR_SCALE_BUTTON_CLASS = `${READING_TOOLBAR_ICON_BUTTON_CLASS} text-xs font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-45`;

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

  const modeLabel = `消息模式：${getConversationMessageViewLabel(messageViewMode)}`;
  const decreaseFontLabel = `缩小消息字体，当前档位 ${fontScale}/6`;
  const increaseFontLabel = `放大消息字体，当前档位 ${fontScale}/6`;

  return (
    <div
      data-slot="conversation-reading-toolbar"
      className="absolute right-3 top-2 z-10 flex animate-[toolbar-in_0.3s_ease-out] items-center gap-1.5 rounded-xl border border-bdr bg-panel/95 px-1.5 py-1.5 shadow-sm backdrop-blur transition-shadow hover:shadow-md md:right-6 md:top-4 md:gap-2 md:px-2 md:py-2"
    >
      <button
        type="button"
        onClick={onCycleMessageViewMode}
        aria-label={modeLabel}
        title={modeLabel}
        data-slot="conversation-reading-mode-toggle"
        className={READING_TOOLBAR_ICON_BUTTON_CLASS}
      >
        <MessageViewIcon mode={messageViewMode} />
      </button>
      <button
        type="button"
        onClick={onDecreaseFontScale}
        aria-label={decreaseFontLabel}
        title={decreaseFontLabel}
        data-slot="conversation-reading-font-decrease"
        disabled={!canDecreaseFontScale}
        className={READING_TOOLBAR_SCALE_BUTTON_CLASS}
      >
        A-
      </button>
      <button
        type="button"
        onClick={onIncreaseFontScale}
        aria-label={increaseFontLabel}
        title={increaseFontLabel}
        data-slot="conversation-reading-font-increase"
        disabled={!canIncreaseFontScale}
        className={READING_TOOLBAR_SCALE_BUTTON_CLASS}
      >
        A+
      </button>
    </div>
  );
}
