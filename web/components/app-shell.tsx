export function ErrorBanner(props: { message: string | null }) {
  const { message } = props;
  if (!message) {
    return null;
  }

  return (
    <div className="mb-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
      {message}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="rounded-[28px] border border-bdr bg-panel/70 px-6 py-5 text-sm text-txt backdrop-blur">
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
