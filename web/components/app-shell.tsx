export function ErrorBanner(props: { message: string | null; onDismiss?: () => void }) {
  const { message, onDismiss } = props;
  if (!message) {
    return null;
  }

  return (
    <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
      <span className="min-w-0 flex-1">{message}</span>
      {onDismiss ? (
        <button
          type="button"
          aria-label="关闭错误提示"
          onClick={onDismiss}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition hover:bg-rose-500/15"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="flex items-center gap-3 rounded-[28px] border border-bdr bg-panel/80 px-6 py-5 text-sm text-txt shadow-lg backdrop-blur">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-bdr border-t-accent" />
        正在初始化 hub-run...
      </div>
    </main>
  );
}

export function PanelLoadingState(props: { label: string }) {
  const { label } = props;

  return (
    <div
      aria-label={label}
      className="flex h-full w-full items-center justify-center px-6 py-8"
    >
      <div className="flex items-center gap-3 rounded-full border border-bdr bg-surface px-4 py-3 text-sm text-txt">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-bdr border-t-accent" />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function BlockingScreenOverlay(props: {
  description?: string;
  label: string;
}) {
  const { description = "页面暂时不可操作，请稍候。", label } = props;

  return (
    <div
      aria-busy="true"
      aria-label={label}
      role="status"
      className="absolute inset-0 z-50 flex items-center justify-center bg-bg/88 px-6 backdrop-blur-sm"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-[28px] border border-bdr bg-panel/92 px-6 py-5 text-center shadow-xl shadow-black/10">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-bdr border-t-accent" />
        <div className="text-sm font-medium text-txt">{label}</div>
        <div className="text-xs leading-5 text-muted">{description}</div>
      </div>
    </div>
  );
}
