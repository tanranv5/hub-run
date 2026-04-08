import type {
  ProviderReasoningEffort,
  ProviderSummary,
  SendMessageInput,
  SessionSummary,
} from "../../api/types";
import type { MutableRefObject } from "react";
import { useEffect, useState } from "react";
import type { BrowserState } from "../browser-state";
import type { ConversationStreamBinding } from "../app-blocking-overlay";
import type { SessionPanelCacheEntry } from "../conversation-panel-session-cache";
import type { ProviderControlsState } from "../provider-controls";
import type { SendConversationResult } from "../conversation-panel-state-types";
import AppHeader from "./app-header";
import { BlockingScreenOverlay, ErrorBanner } from "./app-shell";
import BrowserSidebar from "./browser-sidebar";
import ConversationPanel from "./conversation-panel";

interface AppScreenProps {
  authEnabled: boolean;
  blockingOverlayDescription?: string | null;
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
  onConversationStreamStatusChange?: (binding: ConversationStreamBinding) => void;
  onLoadMore: () => void;
  onLogout: () => void;
  onMessageSent: (sessionId: string, initialDisplay?: string | null) => Promise<void>;
  onNewSessionCwdChange: (value: string) => void;
  onOpenBrowser: () => void;
  onRefresh: () => void;
  onRestartRuntime: () => Promise<void>;
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
  restartingRuntime?: boolean;
  sessionCacheRef: MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  selectedSession: SessionSummary | null;
  sendMessage: (input: SendMessageInput) => Promise<SendConversationResult>;
  sidebarOpen: boolean;
}

export default function AppScreen(props: AppScreenProps) {
  const {
    authEnabled,
    blockingOverlayDescription = null,
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
    onConversationStreamStatusChange,
    onLoadMore,
    onLogout,
    onMessageSent,
    onNewSessionCwdChange,
    onOpenBrowser,
    onRefresh,
    onRestartRuntime,
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
    restartingRuntime = false,
    sessionCacheRef,
    selectedSession,
    sendMessage,
    sidebarOpen,
  } = props;

  const errorMessage = bootstrapError ?? browser.error;
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  useEffect(() => {
    setDismissedError(null);
  }, [errorMessage]);

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
        <ErrorBanner
          message={dismissedError === errorMessage ? null : errorMessage}
          onDismiss={() => setDismissedError(errorMessage)}
        />
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
              onRestartRuntime={onRestartRuntime}
              onConversationStreamStatusChange={onConversationStreamStatusChange}
              onSelectEffort={onSelectEffort}
              onSelectModel={onSelectModel}
              onToggleDesktopSidebar={onToggleDesktopSidebar}
              restartingRuntime={restartingRuntime}
            />
          </div>
        </div>
      </main>
      {blockingOverlayLabel ? (
        <BlockingScreenOverlay
          description={blockingOverlayDescription ?? undefined}
          label={blockingOverlayLabel}
        />
      ) : null}
    </div>
  );
}
