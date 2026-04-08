interface ConversationRecoveryBarProps {
  onRecoverCurrentConversation: () => void;
  onRestartRuntime?: () => void;
  offsetForFloatingToolbar?: boolean;
  recoveringCurrentConversation?: boolean;
  restartingRuntime?: boolean;
  showRestartRuntime?: boolean;
}

export default function ConversationRecoveryBar(
  props: ConversationRecoveryBarProps,
) {
  const {
    onRecoverCurrentConversation,
    onRestartRuntime,
    offsetForFloatingToolbar = false,
    recoveringCurrentConversation = false,
    restartingRuntime = false,
    showRestartRuntime = false,
  } = props;

  return (
    <div
      data-slot="conversation-recovery-bar"
      role="alert"
      className={[
        "mx-4 mb-3 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-txt md:mx-6",
        offsetForFloatingToolbar ? "mt-16 md:mt-[4.5rem]" : "",
      ].join(" ").trim()}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-danger">
            当前回合长时间无输出，可先尝试恢复当前会话
          </p>
          <p className="text-xs text-muted">
            若恢复后仍异常，再升级到重启 hub-run 运行时。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="恢复当前会话"
            disabled={recoveringCurrentConversation || restartingRuntime}
            onClick={onRecoverCurrentConversation}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-danger/30 bg-danger px-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {recoveringCurrentConversation ? "恢复中..." : "恢复当前会话"}
          </button>
          {showRestartRuntime && onRestartRuntime ? (
            <button
              type="button"
              aria-label="重启 hub-run 运行时"
              disabled={recoveringCurrentConversation || restartingRuntime}
              onClick={onRestartRuntime}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-bdr bg-surface px-3 text-sm font-medium text-txt transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {restartingRuntime ? "重启中..." : "重启运行时"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
