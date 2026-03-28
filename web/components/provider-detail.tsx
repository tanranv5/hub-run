import type { ProviderSummary } from "../../api/types";

interface ProviderDetailProps {
  provider: ProviderSummary | null;
}

function CapabilityPill(props: { label: string; enabled: boolean }) {
  const { label, enabled } = props;
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs ${
        enabled
          ? "border-accent-2/30 bg-accent-2/12 text-accent-2"
          : "border-bdr bg-surface text-muted"
      }`}
    >
      {label}
    </span>
  );
}

function EmptyProviderState() {
  return (
    <section className="flex h-full min-h-[26rem] items-center justify-center rounded-[28px] border border-dashed border-bdr bg-surface/40 p-8">
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold text-txt">选择一个 provider</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          当前这轮先把共享壳、鉴权和 provider 路由稳定下来，后续把 Codex 和
          Claude 的真实 transport 往这里挂。
        </p>
      </div>
    </section>
  );
}

function OverviewCard(props: { provider: ProviderSummary }) {
  const { provider } = props;

  return (
    <article className="rounded-[30px] border border-bdr bg-panel p-6 shadow-xl shadow-black/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted">
            Provider
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-txt">
            {provider.label}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            {provider.description}
          </p>
        </div>
        <div className="rounded-2xl border border-bdr bg-surface px-4 py-3 text-right">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">
            Root Path
          </div>
          <div className="mt-2 break-all text-sm text-txt">
            {provider.rootPath}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <CapabilityPill label="History" enabled={provider.capabilities.history} />
        <CapabilityPill label="Send" enabled={provider.capabilities.send} />
        <CapabilityPill label="Stream" enabled={provider.capabilities.stream} />
        <CapabilityPill label="Attach" enabled={provider.capabilities.attach} />
      </div>
    </article>
  );
}

function FocusCard(props: { title: string; description: string }) {
  const { title, description } = props;
  return (
    <div className="rounded-2xl border border-bdr bg-surface p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-muted">
        {title}
      </div>
      <div className="mt-2 text-sm text-txt">{description}</div>
    </div>
  );
}

function BootstrapFocusPanel() {
  return (
    <div className="mt-8 rounded-[26px] border border-bdr bg-panel/55 p-5">
      <div className="text-sm font-medium text-txt">Bootstrap Focus</div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <FocusCard title="Mobile" description="共享壳先适配窄屏抽屉和内容区。" />
        <FocusCard title="Auth" description="password + cookie 已接入后端。" />
        <FocusCard
          title="Adapter"
          description="下一步把 Codex / Claude transport 挂入统一契约。"
        />
      </div>
    </div>
  );
}

function StatusMetric(props: { label: string; value: string }) {
  const { label, value } = props;
  return (
    <div className="rounded-2xl border border-bdr bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-lg font-medium text-txt">{value}</div>
    </div>
  );
}

function StatusCard(props: { provider: ProviderSummary }) {
  const { provider } = props;
  const lastError = provider.status.lastError;

  return (
    <aside className="rounded-[30px] border border-bdr bg-panel p-6 shadow-xl shadow-black/10">
      <p className="text-xs uppercase tracking-[0.22em] text-muted">
        Provider Status
      </p>
      <div className="mt-5 space-y-4">
        <StatusMetric
          label="Config Resolved"
          value={provider.status.configResolved ? "Yes" : "No"}
        />
        <StatusMetric
          label="History Readable"
          value={provider.status.historyReadable ? "Yes" : "No"}
        />
        <StatusMetric
          label="Send Available"
          value={provider.status.sendAvailable ? "Yes" : "No"}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/8 p-4">
        <div className="text-sm font-medium text-amber-700">Last Error</div>
        <div className="mt-2 text-sm leading-6 text-txt/80">
          {lastError ? `${lastError.code}: ${lastError.message}` : "None"}
        </div>
      </div>
    </aside>
  );
}

export default function ProviderDetail(props: ProviderDetailProps) {
  const { provider } = props;

  if (!provider) {
    return <EmptyProviderState />;
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.9fr)]">
      <div>
        <OverviewCard provider={provider} />
        <BootstrapFocusPanel />
      </div>
      <StatusCard provider={provider} />
    </section>
  );
}
