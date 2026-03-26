import type { ProviderSummary } from "../../api/types";

interface ProviderSidebarProps {
  open: boolean;
  providers: ProviderSummary[];
  selectedProviderId: string | null;
  onSelect: (providerId: ProviderSummary["id"]) => void;
  onClose: () => void;
}

function getProviderTone(provider: ProviderSummary): string {
  return provider.status.configResolved
    ? "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-100"
    : "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-100";
}

export default function ProviderSidebar(props: ProviderSidebarProps) {
  const { open, providers, selectedProviderId, onSelect, onClose } = props;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-20 bg-slate-950/50 lg:hidden"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[19rem] border-r border-bdr bg-panel/95 px-4 py-5 backdrop-blur transition-transform lg:static lg:z-0 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">
            Providers
          </p>
          <h2 className="mt-2 text-xl font-semibold text-txt">
            Shared Shell
          </h2>
        </div>

        <div className="space-y-3">
          {providers.map((provider) => {
            const active = provider.id === selectedProviderId;
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => {
                  onSelect(provider.id);
                  onClose();
                }}
                className={`block w-full rounded-3xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-sky-400/40 bg-sky-400/12 shadow-lg shadow-sky-950/30"
                    : "border-bdr bg-surface hover:border-surface hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-medium text-txt">
                    {provider.label}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${getProviderTone(
                      provider,
                    )}`}
                  >
                    {provider.status.configResolved ? "Config Ready" : "Missing Config"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {provider.description}
                </p>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
