import { ArrowLeft } from "lucide-react";

interface SearchContextBarProps {
  hitLabel: string;
  loading: boolean;
  onReturn: (() => void) | undefined;
}

export default function SearchContextBar(props: SearchContextBarProps) {
  const { hitLabel, loading, onReturn } = props;
  return (
    <div
      data-slot="search-context-bar"
      className="flex flex-none items-center gap-3 border-b border-bdr bg-surface/70 px-4 py-2 backdrop-blur"
    >
      <button
        type="button"
        aria-label="返回结果列表"
        onClick={onReturn}
        className="inline-flex items-center gap-1.5 rounded-md border border-bdr bg-panel px-2.5 py-1.5 text-xs font-medium text-txt transition hover:bg-surface-hover"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回结果列表
      </button>
      <span className="ml-auto flex items-center gap-2 text-xs text-muted">
        {loading ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-bdr border-t-accent" />
        ) : null}
        <span>{hitLabel}</span>
      </span>
    </div>
  );
}
