import type { ProviderSummary } from "../../api/types";

interface ProviderSwitcherProps {
  providers: ProviderSummary[];
  selectedProviderId: string | null;
  onSelect: (providerId: ProviderSummary["id"]) => void;
}

function getStatusCopy(provider: ProviderSummary) {
  if (!provider.status.configResolved) {
    return "配置缺失";
  }

  return provider.status.sendAvailable ? "可发送" : "只读";
}

export default function ProviderSwitcher(props: ProviderSwitcherProps) {
  const { providers, selectedProviderId, onSelect } = props;

  return (
    <section className="rounded-[28px] border border-bdr bg-panel/70 p-3 shadow-xl shadow-slate-900/5 dark:shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted">
            Provider
          </p>
          <h2 className="mt-1 text-sm font-medium text-txt">
            消息来源
          </h2>
        </div>
        <span className="text-xs text-muted">{providers.length} 项</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {providers.map((provider) => {
          const active = provider.id === selectedProviderId;
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => onSelect(provider.id)}
              className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                active
                  ? "border-sky-400/35 bg-sky-400/14"
                  : "border-bdr bg-surface hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-50">
                  {provider.label}
                </span>
                <span className="rounded-full border border-bdr px-2 py-0.5 text-[10px] text-muted">
                  {getStatusCopy(provider)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
