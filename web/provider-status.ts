import type { ProviderSummary } from "../api/types";

export function getProviderStatusCopy(provider: ProviderSummary | null): string {
  if (!provider) {
    return "未选择";
  }

  if (!provider.status.configResolved) {
    return "配置缺失";
  }

  return provider.status.sendAvailable ? "可发送" : "只读";
}

export function getProviderStatusTone(provider: ProviderSummary | null): string {
  if (!provider) {
    return "border-bdr bg-surface text-muted";
  }

  if (!provider.status.configResolved) {
    return "border-danger/30 bg-danger/10 text-danger";
  }

  return provider.status.sendAvailable
    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : "border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}
