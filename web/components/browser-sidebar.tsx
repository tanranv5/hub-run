import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { ProviderSummary, SessionSummary } from "../../api/types";
import type { RealtimeStreamStatus } from "../realtime-stream-status";
import {
  clampDesktopSidebarWidth,
  DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  readDesktopSidebarWidth,
  writeDesktopSidebarWidth,
} from "../sidebar-width-state";
import { PanelLoadingState } from "./app-shell";
import SessionBrowser from "./session-browser";

interface BrowserStateLike {
  sessions: SessionSummary[];
  nextBefore: string | null;
  selectedSessionId: string | null;
  streamStatus: RealtimeStreamStatus;
  loading: boolean;
  loadingMore: boolean;
}

interface BrowserSidebarProps {
  browser: BrowserStateLike;
  creatingSession: boolean;
  newSessionCwd: string;
  open: boolean;
  desktopOpen?: boolean;
  projects: string[];
  selectedProject: string | null;
  provider: ProviderSummary | null;
  onClose: () => void;
  onCreateSession: () => void;
  onLoadMore: () => void;
  onNewSessionCwdChange: (value: string) => void;
  onSelectProject: (value: string | null) => void;
  onSelectSession: (sessionId: string) => void;
}

function SidebarContent(props: Omit<BrowserSidebarProps, "desktopOpen" | "open" | "onClose">) {
  const {
    browser,
    creatingSession,
    newSessionCwd,
    projects,
    selectedProject,
    provider,
    onCreateSession,
    onLoadMore,
    onNewSessionCwdChange,
    onSelectProject,
    onSelectSession,
  } = props;

  if (browser.loading && browser.sessions.length === 0) {
    return <PanelLoadingState label="正在加载会话..." />;
  }

  return (
    <div className="relative flex h-full flex-col gap-3 p-3 lg:p-4">
      <SessionBrowser
        provider={provider}
        sessions={browser.sessions}
        nextBefore={browser.nextBefore}
        loading={browser.loading}
        loadingMore={browser.loadingMore}
        creatingSession={creatingSession}
        newSessionCwd={newSessionCwd}
        projects={projects}
        selectedProject={selectedProject}
        selectedSessionId={browser.selectedSessionId}
        onCreateSession={onCreateSession}
        onLoadMore={onLoadMore}
        onNewSessionCwdChange={onNewSessionCwdChange}
        onSelectProject={onSelectProject}
        onSelectSession={onSelectSession}
      />
      {browser.loading ? (
        <div
          aria-busy="true"
          className="absolute inset-0 z-20 flex items-center justify-center bg-panel/80 backdrop-blur-[2px]"
        >
          <PanelLoadingState label="正在加载会话..." />
        </div>
      ) : null}
    </div>
  );
}

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export default function BrowserSidebar(props: BrowserSidebarProps) {
  const {
    browser,
    creatingSession,
    newSessionCwd,
    open,
    desktopOpen = true,
    projects,
    selectedProject,
    provider,
    onClose,
    onCreateSession,
    onLoadMore,
    onNewSessionCwdChange,
    onSelectProject,
    onSelectSession,
  } = props;
  const [desktopWidth, setDesktopWidth] = useState(
    DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  );
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const widthRef = useRef(DESKTOP_SIDEBAR_DEFAULT_WIDTH);

  useEffect(() => {
    setDesktopWidth(readDesktopSidebarWidth(getBrowserStorage()));
  }, []);

  useEffect(() => {
    widthRef.current = desktopWidth;
  }, [desktopWidth]);

  function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    dragRef.current = {
      startX: event.clientX,
      startWidth: widthRef.current,
    };
    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");

    function handlePointerMove(pointerEvent: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const nextWidth = drag.startWidth + pointerEvent.clientX - drag.startX;
      setDesktopWidth(clampDesktopSidebarWidth(nextWidth));
    }

    function finishResize() {
      dragRef.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      writeDesktopSidebarWidth(getBrowserStorage(), widthRef.current);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  }

  return (
    <>
      <div
        className={`${desktopOpen ? "lg:flex" : "hidden"} relative hidden h-full flex-none`}
        style={{ width: `${desktopWidth}px` }}
      >
        <aside className="flex h-full w-full flex-col border-r border-[#30363d]/30 dark:border-[#30363d]/50 bg-panel">
          <SidebarContent
            browser={browser}
            creatingSession={creatingSession}
            newSessionCwd={newSessionCwd}
            projects={projects}
            selectedProject={selectedProject}
            provider={provider}
            onCreateSession={onCreateSession}
            onLoadMore={onLoadMore}
            onNewSessionCwdChange={onNewSessionCwdChange}
            onSelectProject={onSelectProject}
            onSelectSession={onSelectSession}
          />
        </aside>
        <button
          type="button"
          aria-label="调整侧栏宽度"
          onPointerDown={handleResizeStart}
          className="absolute inset-y-0 right-0 z-10 hidden w-3 translate-x-1/2 cursor-col-resize items-center justify-center bg-transparent lg:flex"
        >
          <span className="h-18 w-px rounded-full bg-white/12 transition hover:bg-white/25" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 bg-slate-950/75 p-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={onClose}
            className="absolute inset-0"
            aria-label="关闭会话面板"
          />
          <div className="relative ml-auto h-full w-full max-w-md overflow-y-auto rounded-[30px] border border-white/10 bg-[#08101d] p-3 shadow-[0_30px_80px_rgba(2,6,23,0.6)]">
            <SidebarContent
              browser={browser}
              creatingSession={creatingSession}
              newSessionCwd={newSessionCwd}
              projects={projects}
              selectedProject={selectedProject}
              provider={provider}
              onCreateSession={onCreateSession}
              onLoadMore={onLoadMore}
              onNewSessionCwdChange={onNewSessionCwdChange}
              onSelectProject={onSelectProject}
              onSelectSession={onSelectSession}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
