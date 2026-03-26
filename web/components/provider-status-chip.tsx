import type { ProviderSummary } from "../../api/types";
import {
  getProviderStatusCopy,
  getProviderStatusTone,
} from "../provider-status";

interface ProviderStatusChipProps {
  provider: ProviderSummary | null;
}

export default function ProviderStatusChip(props: ProviderStatusChipProps) {
  const { provider } = props;

  if (!provider) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.12em] uppercase ${getProviderStatusTone(provider)}`}
    >
      {getProviderStatusCopy(provider)}
    </span>
  );
}
