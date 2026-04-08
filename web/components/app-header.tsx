import { LogOut, Menu, RefreshCw, Moon, Sun, Monitor } from "lucide-react";
import type { ProviderSummary } from "../../api/types";
import { useTheme, type ThemeMode } from "../hooks/use-theme";

const HEADER_ICON_BUTTON_CLASS = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-bdr bg-surface text-txt transition hover:bg-surface-hover";
const HEADER_ICON_BUTTON_DISABLED_CLASS = `${HEADER_ICON_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60`;

interface AppHeaderProps {
  authEnabled: boolean;
  provider: ProviderSummary | null;
  providers?: ProviderSummary[];
  refreshing?: boolean;
  onSelectProvider?: (id: string) => void;
  onOpenBrowser: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

interface HeaderActionsProps {
  authEnabled: boolean;
  refreshing: boolean;
  onLogout: () => void;
  onRefresh: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function ProviderSelect(props: {
  provider: ProviderSummary | null;
  providers?: ProviderSummary[];
  disabled?: boolean;
  onSelectProvider?: (id: string) => void;
}) {
  const { provider, providers, disabled = false, onSelectProvider } = props;

  if (!providers?.length || !onSelectProvider) {
    return provider ? (
      <span className="hidden rounded-full border border-bdr bg-surface px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted md:inline-flex">
        {provider.label}
      </span>
    ) : null;
  }

  return (
    <select
      disabled={disabled}
      value={provider?.id ?? ""}
      onChange={(event) => onSelectProvider(event.target.value)}
      className="rounded-full border border-bdr bg-surface py-1 pl-3 pr-8 text-[11px] uppercase tracking-[0.1em] text-txt outline-none transition hover:bg-surface-hover appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2216%22%20height=%2216%22%20viewBox=%220%200%2024%2024%22%20fill=%22none%22%20stroke=%22%2394a3b8%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22><polyline%20points=%226%209%2012%2015%2018%209%22></polyline></svg>')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
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
  const { authEnabled, refreshing, onLogout, onRefresh, theme, onToggleTheme } = props;

  return (
    <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
      <button
        type="button"
        onClick={onToggleTheme}
        className={HEADER_ICON_BUTTON_CLASS}
        title={`切换主题 (当前: ${theme})`}
        aria-label="切换主题"
      >
        {theme === "light" ? <Sun className="h-4 w-4" /> : theme === "dark" ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-busy={refreshing}
        aria-label={refreshing ? "刷新中" : "刷新消息"}
        title={refreshing ? "刷新中..." : "刷新消息"}
        className={HEADER_ICON_BUTTON_DISABLED_CLASS}
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>
      {authEnabled ? (
        <button
          type="button"
          onClick={onLogout}
          aria-label="退出"
          title="退出"
          className={HEADER_ICON_BUTTON_CLASS}
        >
          <LogOut className="h-4 w-4" />
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
    refreshing = false,
    onSelectProvider,
    onOpenBrowser,
    onRefresh,
    onLogout,
  } = props;
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex-none border-b border-bdr bg-panel/80 backdrop-blur">
      <div className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 md:gap-3 md:px-5 md:py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={onOpenBrowser}
            className={`${HEADER_ICON_BUTTON_CLASS} lg:hidden`}
            aria-label="打开会话面板"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-sm font-bold tracking-wide text-txt md:text-xl">
                Hub-Run
              </h1>
              <ProviderSelect
                disabled={refreshing}
                provider={provider}
                providers={providers}
                onSelectProvider={onSelectProvider}
              />
            </div>
          </div>
        </div>
        <HeaderActions
          authEnabled={authEnabled}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      </div>
    </header>
  );
}
