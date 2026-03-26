import { LogOut, Menu, RefreshCw, Moon, Sun, Monitor } from "lucide-react";
import type { ProviderSummary } from "../../api/types";
import { useTheme, type ThemeMode } from "../hooks/use-theme";

interface AppHeaderProps {
  authEnabled: boolean;
  provider: ProviderSummary | null;
  providers?: ProviderSummary[];
  onSelectProvider?: (id: string) => void;
  onOpenBrowser: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

interface HeaderActionsProps {
  authEnabled: boolean;
  onLogout: () => void;
  onRefresh: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function ProviderSelect(props: {
  provider: ProviderSummary | null;
  providers?: ProviderSummary[];
  onSelectProvider?: (id: string) => void;
}) {
  const { provider, providers, onSelectProvider } = props;

  if (!providers?.length || !onSelectProvider) {
    return provider ? (
      <span className="hidden rounded-full border border-bdr bg-surface px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted md:inline-flex">
        {provider.label}
      </span>
    ) : null;
  }

  return (
    <select
      value={provider?.id ?? ""}
      onChange={(event) => onSelectProvider(event.target.value)}
      className="rounded-full border border-bdr bg-surface py-1 pl-3 pr-8 text-[11px] uppercase tracking-[0.1em] text-txt outline-none transition hover:bg-surface-hover appearance-none cursor-pointer bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2216%22%20height=%2216%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%2394a3b8%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22><polyline%20points=%226%209%2012%2015%2018%209%22></polyline></svg>')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
    >
      {providers.map((item) => (
        <option key={item.id} value={item.id} className="bg-panel">
          {item.label}
        </option>
      ))}
    </select>
  );
}

function HeaderActions(props: HeaderActionsProps) {
  const { authEnabled, onLogout, onRefresh, theme, onToggleTheme } = props;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onToggleTheme}
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-bdr bg-surface text-txt transition hover:bg-surface-hover"
        title={`切换主题 (当前: ${theme})`}
        aria-label="切换主题"
      >
        {theme === "light" ? <Sun className="h-5 w-5" /> : theme === "dark" ? <Moon className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-bdr bg-surface px-3 text-sm text-txt transition hover:bg-surface-hover"
      >
        <RefreshCw className="h-4 w-4" />
        <span className="hidden sm:inline">刷新消息</span>
      </button>
      {authEnabled ? (
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-bdr bg-surface px-3 text-sm text-txt transition hover:bg-surface-hover"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">退出</span>
        </button>
      ) : null}
    </div>
  );
}

export default function AppHeader(props: AppHeaderProps) {
  const {
    authEnabled,
    provider,
    providers,
    onSelectProvider,
    onOpenBrowser,
    onRefresh,
    onLogout,
  } = props;
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex-none border-b border-bdr bg-panel/80 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-3 px-3 py-2 md:px-5 md:py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenBrowser}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-bdr bg-surface text-txt transition hover:bg-surface-hover lg:hidden"
            aria-label="打开会话面板"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-lg font-bold tracking-wide text-txt md:text-xl">
                Hub-Run
              </h1>
              <ProviderSelect
                provider={provider}
                providers={providers}
                onSelectProvider={onSelectProvider}
              />
            </div>
          </div>
        </div>
        <HeaderActions
          authEnabled={authEnabled}
          onRefresh={onRefresh}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>
    </header>
  );
}
