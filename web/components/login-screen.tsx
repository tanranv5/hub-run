interface LoginScreenProps {
  busy: boolean;
  error: string | null;
  onSubmit: (password: string) => Promise<void>;
}

export default function LoginScreen(props: LoginScreenProps) {
  const { busy, error, onSubmit } = props;

  async function handleSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    await onSubmit(password);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10 bg-bg transition-colors duration-500">
      <div className="w-full max-w-md rounded-[32px] border border-bdr bg-panel p-8 shadow-xl shadow-black/5 dark:shadow-black/20">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent">
              hub-run
            </p>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-txt">
            密码登录
          </h1>
        </div>

        <form
          action={handleSubmit}
          className="space-y-6"
        >
          <div className="space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-muted px-1">
              访问密码
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="输入 hub-run password"
              className="w-full rounded-2xl border border-bdr bg-panel-2 px-5 py-3.5 text-sm text-txt outline-none ring-accent/20 transition-all focus:border-accent focus:ring-4 placeholder:text-muted/50"
              disabled={busy}
              required
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3.5 text-xs font-medium text-danger animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="group relative w-full overflow-hidden rounded-2xl bg-accent px-4 py-4 font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="relative flex items-center justify-center gap-2">
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              <span>{busy ? "验证中..." : "进入控制台"}</span>
            </div>
          </button>
        </form>
      </div>
    </main>
  );
}
