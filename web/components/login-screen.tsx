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
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-bdr bg-panel/70 p-7 shadow-2xl shadow-sky-950/5 dark:shadow-sky-950/30 backdrop-blur">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.24em] text-sky-700/80 dark:text-sky-300/80">
            hub-run
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-50">
            Password Login
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            一期只做本地 password 鉴权。登录成功后，前端会通过同一 cookie
            访问 provider 路由和后续 SSE。
          </p>
        </div>

        <form
          action={handleSubmit}
          className="space-y-4"
        >
          <label className="block">
            <span className="mb-2 block text-sm text-muted">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="输入 hub-run password"
              className="w-full rounded-2xl border border-bdr bg-panel-2/80 px-4 py-3 text-txt outline-none transition focus:border-accent/70"
              disabled={busy}
              required
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-sky-400 px-4 py-3 font-medium text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-panel disabled:text-muted"
          >
            {busy ? "登录中..." : "进入 hub-run"}
          </button>
        </form>
      </div>
    </main>
  );
}
