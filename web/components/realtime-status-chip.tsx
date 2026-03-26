import type {
  RealtimeStreamScope,
  RealtimeStreamStatus,
} from "../realtime-stream-status";
import {
  getRealtimeStreamStatusLabel,
  getRealtimeStreamTone,
} from "../realtime-stream-status";

interface RealtimeStatusChipProps {
  scope: RealtimeStreamScope;
  status: RealtimeStreamStatus;
}

export default function RealtimeStatusChip(props: RealtimeStatusChipProps) {
  const { scope, status } = props;
  const label = getRealtimeStreamStatusLabel(scope, status);
  const tone = getRealtimeStreamTone(status);
  if (!label || !tone) {
    return null;
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] ${getToneClassName(tone)}`}>
      {label}
    </span>
  );
}

function getToneClassName(
  tone: "neutral" | "success" | "warning" | "danger",
): string {
  switch (tone) {
    case "neutral":
      return "border border-sky-400/20 bg-sky-500/10 text-sky-700 dark:text-sky-100";
    case "success":
      return "border border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-100";
    case "warning":
      return "border border-amber-400/20 bg-amber-500/10 text-amber-700 dark:text-amber-100";
    case "danger":
      return "border border-rose-400/20 bg-rose-500/10 text-rose-700 dark:text-rose-100";
  }
}
