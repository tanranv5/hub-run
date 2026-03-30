import { useMemo, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import type { ProviderSummary, SessionSummary } from "../../api/types";
import {
  matchesSessionFilter,
  resolveSelectedProject,
} from "../session-browser-state";
import ProjectPathField from "./project-path-field";
import {
  LoadMoreButton,
  SessionBrowserList,
} from "./session-browser-list";

interface SessionBrowserProps {
  provider: ProviderSummary | null;
  projects: string[];
  selectedProject: string | null;
  sessions: SessionSummary[];
  totalSessionCount?: number | null;
  nextBefore: string | null;
  loading: boolean;
  loadingMore: boolean;
  refreshing?: boolean;
  creatingSession: boolean;
  newSessionCwd: string;
  selectedSessionId: string | null;
  onCreateSession: () => void;
  onNewSessionCwdChange: (value: string) => void;
  onLoadMore: () => void;
  onSelectProject: (value: string | null) => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

function SearchBar(props: {
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const { disabled = false, value, onChange } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative mb-3">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
      <input
        ref={inputRef}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索会话..."
        aria-label="搜索会话"
        className="w-full rounded-lg border border-bdr bg-surface py-2 pl-9 pr-8 text-sm text-txt outline-none transition placeholder:text-muted focus:border-bdr focus:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
      />
      {value && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted transition hover:text-txt disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="清除搜索"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function BrowserHeader(props: {
  provider: ProviderSummary | null;
  sessionCount: number;
  totalSessionCount?: number | null;
}) {
  const { provider, sessionCount, totalSessionCount = null } = props;
  const displayCount = totalSessionCount ?? sessionCount;

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-txt">会话</h2>
        <p className="mt-1 text-xs text-muted">
          {provider ? provider.label : "未选择 Provider"}
        </p>
      </div>
      <span className="rounded-full border border-bdr bg-surface px-3 py-1 text-[11px] text-muted">
        {displayCount} 条会话
      </span>
    </div>
  );
}

function CreateSessionControls(props: {
  creatingSession: boolean;
  disabled?: boolean;
  newSessionCwd: string;
  projects: string[];
  selectedProject: string | null;
  provider: ProviderSummary | null;
  onCreateSession: () => void;
  onNewSessionCwdChange: (value: string) => void;
  onSelectProject: (value: string | null) => void;
}) {
  const {
    creatingSession,
    disabled = false,
    newSessionCwd,
    projects,
    selectedProject,
    provider,
    onCreateSession,
    onNewSessionCwdChange,
    onSelectProject,
  } = props;

  if (!provider?.capabilities.createSession) {
    return null;
  }

  return (
    <div className="mb-3 space-y-2">
      <label className="block text-[11px] uppercase tracking-[0.18em] text-muted">
        项目路径
      </label>
      <div className="flex items-center gap-2">
        <ProjectPathField
          disabled={disabled}
          projects={projects}
          selectedProject={selectedProject}
          value={newSessionCwd}
          onChange={(value) => {
            onNewSessionCwdChange(value);
            onSelectProject(resolveSelectedProject(projects, value));
          }}
          onSelectProject={onSelectProject}
        />
        <button
          type="button"
          onClick={onCreateSession}
          disabled={creatingSession || disabled}
          aria-label="新建会话"
          title={disabled ? "刷新中..." : creatingSession ? "创建中..." : "新建会话"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-500/15 text-cyan-700 dark:text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyState(props: { loading: boolean }) {
  const { loading } = props;

  return (
    <div className="flex flex-1 items-center justify-center p-5 text-sm text-muted">
      {loading ? "正在加载..." : "暂无会话。"}
    </div>
  );
}

export default function SessionBrowser(props: SessionBrowserProps) {
  const {
    creatingSession,
    newSessionCwd,
    provider,
    projects,
    selectedProject,
    sessions,
    totalSessionCount = null,
    nextBefore,
    loading,
    loadingMore,
    refreshing = false,
    selectedSessionId,
    onCreateSession,
    onNewSessionCwdChange,
    onLoadMore,
    onSelectProject,
    onSelectSession,
    onDeleteSession,
  } = props;
  const [search, setSearch] = useState("");

  const filteredSessions = useMemo(
    () => sessions.filter((session) => matchesSessionFilter(session, selectedProject, search)),
    [search, selectedProject, sessions],
  );

  return (
    <section className="flex flex-1 min-h-0 flex-col bg-transparent" aria-busy={refreshing}>
      <BrowserHeader
        provider={provider}
        sessionCount={sessions.length}
        totalSessionCount={totalSessionCount}
      />
      <CreateSessionControls
        creatingSession={creatingSession}
        disabled={refreshing}
        newSessionCwd={newSessionCwd}
        projects={projects}
        selectedProject={selectedProject}
        provider={provider}
        onCreateSession={onCreateSession}
        onNewSessionCwdChange={onNewSessionCwdChange}
        onSelectProject={onSelectProject}
      />
      <SearchBar disabled={refreshing} value={search} onChange={setSearch} />
      {filteredSessions.length ? (
        <SessionBrowserList
          disabled={refreshing}
          sessions={filteredSessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
        />
      ) : (
        <EmptyState loading={loading} />
      )}
      <LoadMoreButton
        disabled={refreshing}
        loadingMore={loadingMore}
        nextBefore={nextBefore}
        onLoadMore={onLoadMore}
      />
    </section>
  );
}
