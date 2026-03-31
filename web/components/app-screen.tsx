import type {
  ProviderReasoningEffort,
  ProviderSummary,
  SessionSummary,
} from "../../api/types";
import type { MutableRefObject } from "react";
import type { BrowserState } from "../browser-state";
import type { SessionPanelCacheEntry } from "../conversation-panel-session-cache";
import type { ProviderControlsState } from "../provider-controls";
import type { SendConversationResult } from "../conversation-panel-state-types";
import AppHeader from "./app-header";
import { BlockingScreenOverlay, ErrorBanner } from "./app-shell";
import BrowserSidebar from "./browser-sidebar";
import ConversationPanel from "./conversation-panel";

interface AppScreenProps {
  authEnabled: boolean;
  bootstrapError: string | null;
  blockingOverlayLabel?: string | null;
  browser: BrowserState;
  contextDetails: string | null;
  contextLabel: string | null;
  controls: ProviderControlsState;
  desktopSidebarOpen: boolean;
  effortOptions: ProviderReasoningEffort[];
  refreshing: boolean;
  onCreateSession: () => void;
  onCloseSidebar: () => void;
  onLoadMore: () => void;
  onLogout: () => void;
  onMessageSent: (sessionId: string) => Promise<void>;
  onNewSessionCwdChange: (value: string) => void;
  onOpenBrowser: () => void;
  onRefresh: () => void;
  onSelectEffort: (value: ProviderControlsState["selectedEffort"]) => void;
  onSelectModel: (value: string | null) => void;
  onSelectProject: (value: string | null) => void;
  onSelectProvider: (providerId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => Promise<void> | void;
  onToggleDesktopSidebar: () => void;
  panelRefreshVersion: number;
  provider: ProviderSummary | null;
  providers: ProviderSummary[];
  sessionCacheRef: MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  selectedSession: SessionSummary | null;
  sendMessage: (text: string) => Promise<SendConversationResult>;
  sidebarOpen: boolean;
}

export default function AppScreen(props: AppScreenProps) {
  const {
    authEnabled,
    bootstrapError,
    blockingOverlayLabel = null,
    browser,
    contextDetails,
    contextLabel,
    controls,
    desktopSidebarOpen,
    effortOptions,
    refreshing,
    onCreateSession,
    onCloseSidebar,
    onLoadMore,
    onLogout,
    onMessageSent,
    onNewSessionCwdChange,
    onOpenBrowser,
    onRefresh,
    onSelectEffort,
    onSelectModel,
    onSelectProject,
    onSelectProvider,
    onSelectSession,
    onDeleteSession,
    onToggleDesktopSidebar,
    panelRefreshVersion,
    provider,
    providers,
    sessionCacheRef,
    selectedSession,
    sendMessage,
    sidebarOpen,
  } = props;

  return (
    <div
      aria-busy={blockingOverlayLabel ? "true" : undefined}
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)]"
    >
      <AppHeader
        authEnabled={authEnabled}
        provider={provider}
        providers={providers}
        refreshing={refreshing}
        onSelectProvider={onSelectProvider}
        onOpenBrowser={onOpenBrowser}
        onRefresh={onRefresh}
        onLogout={onLogout}
      />
      <main className="relative flex flex-1 overflow-hidden">
        <ErrorBanner message={bootstrapError ?? browser.error} />
        <div className="relative flex h-full w-full">
          <BrowserSidebar
            browser={browser}
            creatingSession={controls.creatingSession}
            errorMessage={controls.error}
            newSessionCwd={controls.newSessionCwd}
            open={sidebarOpen}
            desktopOpen={desktopSidebarOpen}
            projects={controls.projects}
            selectedProject={controls.selectedProject}
            provider={provider}
            onClose={onCloseSidebar}
            onCreateSession={onCreateSession}
            onLoadMore={onLoadMore}
            onNewSessionCwdChange={onNewSessionCwdChange}
            onSelectProject={onSelectProject}
            onSelectSession={onSelectSession}
            onDeleteSession={onDeleteSession}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg)]">
            <ConversationPanel
              contextDetails={contextDetails}
              contextLabel={contextLabel}
              effortOptions={effortOptions}
              modelOptions={controls.models}
              provider={provider}
              refreshVersion={panelRefreshVersion}
              refreshing={refreshing}
              sessionCacheRef={sessionCacheRef}
              selectedEffort={controls.selectedEffort}
              selectedModelId={controls.selectedModelId}
              session={selectedSession}
              sendMessage={sendMessage}
              onMessageSent={onMessageSent}
              onOpenBrowser={onOpenBrowser}
              onSelectEffort={onSelectEffort}
              onSelectModel={onSelectModel}
              onToggleDesktopSidebar={onToggleDesktopSidebar}
            />
          </div>
        </div>
      </main>
      {blockingOverlayLabel ? (
        <BlockingScreenOverlay label={blockingOverlayLabel} />
      ) : null}
    </div>
  );
}
