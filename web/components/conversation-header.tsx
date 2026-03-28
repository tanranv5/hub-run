import { Check, Copy, PanelLeft } from "lucide-react";
import { useState } from "react";
import type { SessionSummary } from "../../api/types";
import type { ConversationStatus } from "../conversation-status";
import { getSessionTitle } from "../session-browser-state";
import { formatTime } from "../utils";
import ConversationSessionStatus from "./conversation-session-status";

const COPY_TOOLTIP_LABEL = "复制会话 ID";
const COPIED_TOOLTIP_LABEL = "已复制会话 ID";

interface ConversationHeaderProps {
  conversationStatus: ConversationStatus;
  session: SessionSummary;
  onToggleDesktopSidebar: () => void;
}

export default function ConversationHeader(props: ConversationHeaderProps) {
  const {
    conversationStatus,
    session,
    onToggleDesktopSidebar,
  } = props;
  const [copied, setCopied] = useState(false);
  const title = getSessionTitle(session.display);
  const projectLabel = session.projectName || session.project;
  const relativeTime = formatTime(session.timestamp);

  async function handleCopySessionId() {
    if (!navigator.clipboard) {
      throw new Error("Clipboard API unavailable");
    }
    await navigator.clipboard.writeText(session.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex-none border-b border-bdr px-4 py-3 md:px-6 md:py-4">
      <div className="flex items-start gap-3 md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <button
            type="button"
            onClick={onToggleDesktopSidebar}
            className="hidden h-9 w-9 items-center justify-center rounded-xl border border-bdr bg-surface text-txt transition hover:bg-surface-hover lg:inline-flex"
            aria-label="切换侧边栏"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div data-region="conversation-header-meta" className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-txt md:text-lg">
              {title}
            </h2>
            <p className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
                <span className="truncate">{projectLabel}</span>
                <span className="shrink-0">{relativeTime}</span>
              </span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-2">
                <span className="group relative inline-flex">
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
                <div className="flex-none max-w-[120px] md:max-w-none">
                  <ConversationSessionStatus
                    conversationStatus={conversationStatus}
                  />
                </div>
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
