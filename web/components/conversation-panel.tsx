import { filterConversationMessages } from "../../api/conversation-search";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import type {
  ConversationMessage,
  ConversationSearchMode,
  ProviderModelOption,
  ProviderReasoningEffort,
  SendImageInput,
  SendMessageInput,
  ProviderSummary,
  ProviderThreadState,
  ProviderUserInputRequest,
  SessionSummary,
} from "../../api/types";
import { useConversationPanelSearch } from "../conversation-panel-search";
import { useConversationPanelState } from "../conversation-panel-state";
import type { SendConversationResult } from "../conversation-panel-state-types";
import type { SessionPanelCacheEntry } from "../conversation-panel-session-cache";
import { isOptimisticUserMessage } from "../conversation-panel-state-helpers";
import { DEFAULT_MESSAGE_FONT_SCALE } from "../conversation-reading-styles";
import type { RealtimeStreamStatus } from "../realtime-stream-status";
import { resolveConversationStatus, type ConversationStatus } from "../conversation-status";
import type { ConversationStreamBinding } from "../app-blocking-overlay";
import {
  getBrowserStorage,
  readConversationReadingPreference,
  writeConversationReadingPreference,
} from "../ui-preferences";
import { PanelLoadingState } from "./app-shell";
import ConversationComposer from "./conversation-composer";
import ConversationHeader from "./conversation-header";
import ConversationRecoveryBar from "./conversation-recovery-bar";
import ConversationReadingToolbar from "./conversation-reading-toolbar";
import ConversationSearchResultsPage from "./conversation-search-results-page";
import SearchContextBar from "./search-context-bar";
import { useVoiceInput } from "../use-voice-input";
import {
  EmptyConversationState,
} from "./conversation-message";
import ConversationTimeline from "./conversation-timeline";
import { isSendLifecycleActive, type SendLifecycle } from "../conversation-send-state";

export function canInterruptConversation(props: {
  interruptAvailable: boolean;
  loading: boolean;
  sendLifecycle: SendLifecycle | null;
  streamStatus: RealtimeStreamStatus;
  threadState: ProviderThreadState | null;
}) {
  const {
    interruptAvailable,
    loading,
    sendLifecycle,
    streamStatus: _streamStatus,
    threadState,
  } = props;
  if (loading || !interruptAvailable) {
    return false;
  }
  if (threadState?.isGenerating === true || threadState?.stalled === true) {
    return true;
  }
  if (!sendLifecycle) {
    return false;
  }
  return isSendLifecycleActive(sendLifecycle) || sendLifecycle.phase === "timedOut";
}

function cycleMessageViewMode(
  mode: ConversationSearchMode,
): ConversationSearchMode {
  if (mode === "all") {
    return "compact";
  }
  if (mode === "compact") {
    return "text";
  }
  return "all";
}

function cycleMessageFontScale(current: number): number {
  return current >= 6 ? 1 : current + 1;
}

const MIN_BACKFILL_VISIBLE_COUNT = 1;
const EMPTY_MATCHED_MESSAGE_IDS = new Set<string>();

export function resolveMessageViewModeBackfillAction(props: {
  hasOlderMessages: boolean;
  loading: boolean;
  loadingOlder: boolean;
  targetVisibleCount: number | null;
  visibleCount: number;
}): "idle" | "clear" | "load" {
  const {
    hasOlderMessages,
    loading,
    loadingOlder,
    targetVisibleCount,
    visibleCount,
  } = props;
  if (targetVisibleCount === null) {
    return "idle";
  }
  if (
    targetVisibleCount < MIN_BACKFILL_VISIBLE_COUNT ||
    visibleCount >= targetVisibleCount ||
    !hasOlderMessages
  ) {
    return "clear";
  }
  if (loading || loadingOlder) {
    return "idle";
  }
  return "load";
}

interface ConversationPanelProps {
  contextDetails?: string | null;
  contextLabel?: string | null;
  effortOptions: ProviderReasoningEffort[];
  modelOptions: ProviderModelOption[];
  provider: ProviderSummary | null;
  refreshVersion?: number;
  refreshing?: boolean;
  sessionCacheRef: MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  selectedEffort: ProviderReasoningEffort | null;
  selectedModelId: string | null;
  session: SessionSummary | null;
  onMessageSent: (sessionId: string, initialDisplay?: string | null) => Promise<void>;
  onConversationStreamStatusChange?: (binding: ConversationStreamBinding) => void;
  onOpenBrowser: () => void;
  onRestartRuntime?: () => Promise<void>;
  onSelectEffort: (value: ProviderReasoningEffort | null) => void;
  onSelectModel: (value: string | null) => void;
  onToggleDesktopSidebar: () => void;
  restartingRuntime?: boolean;
  sendMessage: (input: SendMessageInput) => Promise<SendConversationResult>;
}

interface ConversationBodyProps {
  activeSearchMessageId?: string | null;
  composerBrowseCollapsed?: boolean;
  composerStoredHeight?: number | null;
  canInterrupt: boolean;
  contextDetails?: string | null;
  contextLabel?: string | null;
  conversationStatus: ConversationStatus;
  draft: string;
  effortOptions: ProviderReasoningEffort[];
  error: string | null;
  hasOlderMessages: boolean;
  imageUploadEnabled?: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasBufferedLatest: boolean;
  highlightQuery?: string;
  matchedSearchMessageIds?: ReadonlySet<string>;
  messages: ConversationMessage[];
  messageWindowFrozen: boolean;
  messageFontScale: number;
  messageViewMode: ConversationSearchMode;
  modelOptions: ProviderModelOption[];
  olderLoadCount: number;
  pendingImages: SendImageInput[];
  pendingUserInputRequests: ProviderUserInputRequest[];
  providerSendAvailable: boolean;
  recoveringConversation?: boolean;
  refreshing?: boolean;
  modeSwitching?: boolean;
  respondingRequestId: string | null;
  interrupting: boolean;
  onRecoverConversation?: () => void;
  searchContextLoading?: boolean;
  searchMode?: "off" | "all-results" | "all-context";
  searchResultsPage?: ReactNode;
  searchHitLabel?: string;
  sessionId?: string | null;
  selectedEffort: ProviderReasoningEffort | null;
  selectedModelId: string | null;
  sending: boolean;
  showRuntimeRestart?: boolean;
  onReturnToSearchResults?: () => void;
  summary: ConversationMessage | null;
  onRestartRuntime?: () => void;
  restartingRuntime?: boolean;
  onDraftChange: (value: string) => void;
  onPendingImagesChange: (images: SendImageInput[]) => void;
  onInterrupt: () => void;
  onLoadOlder: () => void;
  onLoadOlderToStart: () => void;
  onBrowseMessages?: () => void;
  onComposerExpand?: () => void;
  onComposerStoredHeightChange?: (height: number) => void;
  onMessageWindowFrozenChange: (frozen: boolean) => void;
  onRespondUserInput: (
    request: ProviderUserInputRequest,
    questionId: string,
    optionLabel: string,
  ) => void;
  onSelectEffort: (value: ProviderReasoningEffort | null) => void;
  onSelectModel: (value: string | null) => void;
  onSend: () => void;
  onViewLatest: () => void;
  voicePhase: "idle" | "starting" | "recording" | "stopping";
  onDecreaseFontScale: () => void;
  onIncreaseFontScale: () => void;
  onCycleMessageViewMode: () => void;
  onVoiceClick: () => void;
}

function ConversationRefreshOverlay() {
  return (
    <div
      aria-label="正在刷新当前会话..."
      aria-live="polite"
      role="status"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg)] px-6 py-8"
    >
      <div className="flex items-center gap-3 rounded-full border border-bdr bg-surface px-4 py-3 text-sm text-txt shadow-lg shadow-black/5">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-bdr border-t-accent" />
        <span>刷新中，正在重新拉取当前会话...</span>
      </div>
    </div>
  );
}

function ConversationModeSwitchOverlay() {
  return (
    <div
      aria-label="正在切换消息模式..."
      aria-live="polite"
      role="status"
      className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg)] px-6 py-8"
    >
      <div className="flex items-center gap-3 rounded-full border border-bdr bg-surface px-4 py-3 text-sm text-txt shadow-lg shadow-black/5">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-bdr border-t-accent" />
        <span>切换中，正在重新渲染当前消息...</span>
      </div>
    </div>
  );
}

export const ConversationBody = memo(function ConversationBody(props: ConversationBodyProps) {
  const {
    activeSearchMessageId = null,
    composerBrowseCollapsed = false,
    composerStoredHeight = null,
    canInterrupt,
    contextDetails = null,
    contextLabel = null,
    conversationStatus,
    draft,
    effortOptions,
    error,
    hasOlderMessages,
    imageUploadEnabled = false,
    hasBufferedLatest,
    highlightQuery = "",
    loading,
    loadingOlder,
    matchedSearchMessageIds = EMPTY_MATCHED_MESSAGE_IDS,
    messageWindowFrozen,
    messageFontScale,
    messageViewMode,
    messages,
    modelOptions,
    olderLoadCount,
    pendingImages,
    onBrowseMessages,
    onComposerExpand,
    onComposerStoredHeightChange,
    onPendingImagesChange,
    pendingUserInputRequests,
    onDraftChange,
    onInterrupt,
    onRecoverConversation,
    onLoadOlder,
    onLoadOlderToStart,
    onMessageWindowFrozenChange,
    onRespondUserInput,
    onSelectEffort,
    onSelectModel,
    onSend,
    onRestartRuntime,
    recoveringConversation = false,
    restartingRuntime = false,
    onViewLatest,
    voicePhase,
    onDecreaseFontScale,
    onIncreaseFontScale,
    onCycleMessageViewMode,
    onVoiceClick,
    interrupting,
    providerSendAvailable,
    refreshing = false,
    modeSwitching = false,
    respondingRequestId,
    searchContextLoading = false,
    searchMode = "off",
    searchResultsPage = null,
    searchHitLabel = "",
    sessionId = null,
    selectedEffort,
    selectedModelId,
    sending,
    showRuntimeRestart = false,
    onReturnToSearchResults,
    summary,
  } = props;

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelLoadingState label="正在加载记录..." />
      </div>
    );
  }

  const isInAllSearch = searchMode === "all-results" || searchMode === "all-context";
  const hideReadingToolbar = searchMode === "all-context";

  return (
    <div
      aria-busy={refreshing || modeSwitching}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {hideReadingToolbar ? null : (
        <ConversationReadingToolbar
          busy={modeSwitching}
          fontScale={messageFontScale}
          messageViewMode={messageViewMode}
          onDecreaseFontScale={onDecreaseFontScale}
          onIncreaseFontScale={onIncreaseFontScale}
          onCycleMessageViewMode={onCycleMessageViewMode}
        />
      )}
      {searchMode === "all-results" && searchResultsPage ? (
        searchResultsPage
      ) : (
        <>
          {searchMode === "all-context" ? (
            <SearchContextBar
              hitLabel={searchHitLabel}
              loading={searchContextLoading}
              onReturn={onReturnToSearchResults}
            />
          ) : null}
          {conversationStatus.phase === "stalled" && onRecoverConversation ? (
            <ConversationRecoveryBar
              onRecoverCurrentConversation={onRecoverConversation}
              onRestartRuntime={onRestartRuntime}
              offsetForFloatingToolbar={!isInAllSearch}
              recoveringCurrentConversation={recoveringConversation}
              restartingRuntime={restartingRuntime}
              showRestartRuntime={showRuntimeRestart}
            />
          ) : null}
          <ConversationTimeline
            activeSearchMessageId={activeSearchMessageId}
            error={error}
            hasOlderMessages={hasOlderMessages}
            hasBufferedLatest={hasBufferedLatest}
            highlightQuery={highlightQuery}
            loading={loading}
            loadingOlder={loadingOlder}
            messageWindowFrozen={messageWindowFrozen}
            matchedSearchMessageIds={matchedSearchMessageIds}
            messageFontScale={messageFontScale}
            messageViewMode={messageViewMode}
            messages={messages}
            olderLoadCount={olderLoadCount}
            onBrowseMessages={onBrowseMessages}
            pendingUserInputRequests={pendingUserInputRequests}
            respondingRequestId={respondingRequestId}
            sessionId={sessionId}
            summary={summary}
            onLoadOlder={onLoadOlder}
            onLoadOlderToStart={onLoadOlderToStart}
            onSetMessageWindowFrozen={onMessageWindowFrozenChange}
            onRespondUserInput={onRespondUserInput}
            onViewLatest={onViewLatest}
          />
        </>
      )}
      {!isInAllSearch && providerSendAvailable ? (
        <ConversationComposer
          browseCollapsed={composerBrowseCollapsed}
          canInterrupt={canInterrupt}
          contextDetails={contextDetails}
          contextLabel={contextLabel}
          conversationStatus={conversationStatus}
          draft={draft}
          effortOptions={effortOptions}
          imageUploadEnabled={imageUploadEnabled}
          interrupting={interrupting}
          modelOptions={modelOptions}
          pendingImages={pendingImages}
          refreshing={refreshing}
          selectedEffort={selectedEffort}
          selectedModelId={selectedModelId}
          sending={sending}
          storedHeight={composerStoredHeight}
          voicePhase={voicePhase}
          onDraftChange={onDraftChange}
          onExpandFromBrowse={onComposerExpand}
          onInterrupt={onInterrupt}
          onPendingImagesChange={onPendingImagesChange}
          onSelectEffort={onSelectEffort}
          onSelectModel={onSelectModel}
          onSend={onSend}
          onStoredHeightChange={onComposerStoredHeightChange}
          onVoiceClick={onVoiceClick}
        />
      ) : null}
      {modeSwitching ? <ConversationModeSwitchOverlay /> : null}
      {!modeSwitching && refreshing ? <ConversationRefreshOverlay /> : null}
    </div>
  );
});

export default function ConversationPanel(props: ConversationPanelProps) {
  const [storedReadingPreference] = useState(() =>
    readConversationReadingPreference(getBrowserStorage()),
  );
  const messageViewModeRef = useRef<ConversationSearchMode>(
    storedReadingPreference?.messageViewMode ?? "all",
  );
  const [messageViewMode, setMessageViewMode] = useState<ConversationSearchMode>(
    storedReadingPreference?.messageViewMode ?? "all",
  );
  const {
    contextDetails = null,
    contextLabel = null,
    effortOptions,
    modelOptions,
    onMessageSent,
    onConversationStreamStatusChange,
    onOpenBrowser,
    onRestartRuntime,
    onSelectEffort,
    onSelectModel,
    onToggleDesktopSidebar,
    provider,
    refreshVersion = 0,
    refreshing = false,
    restartingRuntime = false,
    sessionCacheRef,
    selectedEffort,
    selectedModelId,
    sendMessage,
    session,
  } = props;
  const {
    draft,
    hasOlderMessages,
    handleMessageWindowFrozenChange,
    handleInterrupt,
    handleLoadOlder,
    handleLoadOlderToStart,
    handleRefreshConversation,
    images,
    handleRespondUserInput,
    handleSend,
    handleShowLocatedWindow,
    handleViewLatest,
    setDraft,
    setImages,
    state,
  } =
    useConversationPanelState({
      messageViewMode,
      messageViewModeRef,
      providerId: provider?.id ?? null,
      refreshVersion,
      sessionCacheRef,
      sendMessage,
      session,
      streamAvailable: provider?.capabilities.stream ?? false,
      onMessageSent,
    });
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageFontScale, setMessageFontScale] = useState(
    storedReadingPreference?.messageFontScale ?? DEFAULT_MESSAGE_FONT_SCALE,
  );
  const [headerCollapsed, setHeaderCollapsed] = useState(
    storedReadingPreference?.headerCollapsed ?? false,
  );
  const [messageViewModeBackfillTarget, setMessageViewModeBackfillTarget] = useState<number | null>(null);
  const [messageViewModeSwitching, setMessageViewModeSwitching] = useState(false);
  const [recoveringConversation, setRecoveringConversation] = useState(false);
  const [composerStoredHeight, setComposerStoredHeight] = useState<number | null>(
    storedReadingPreference?.composerStoredHeight ?? null,
  );
  const [composerBrowseCollapsed, setComposerBrowseCollapsed] = useState(false);
  const [showRuntimeRestart, setShowRuntimeRestart] = useState(false);
  const { handleVoiceClick, voicePhase } = useVoiceInput({
    draft,
    onError: setVoiceError,
    sessionKey: provider && session ? `${provider.id}:${session.id}` : null,
    setDraft,
  });
  const visibleMessages = useMemo(
    () => filterConversationMessages(state.messages, messageViewMode),
    [messageViewMode, state.messages],
  );
  const {
    activeHitIndex,
    activeMessageId,
    clearSearch,
    contextLoading: searchContextLoading,
    error: searchError,
    goToNextHit,
    goToPreviousHit,
    loading: searchLoading,
    matchedMessageIds,
    openAllSearchHit,
    query: searchQuery,
    reopenAllSearchResults,
    scope: searchScope,
    searchPageCountLabel,
    searchPageHits,
    searchPageTotalHits,
    setQuery: setSearchQuery,
    setScope: setSearchScope,
    showSearchResultsPage,
    statusLabel: searchStatusLabel,
  } = useConversationPanelSearch({
    mode: messageViewMode,
    onShowLocatedWindow: handleShowLocatedWindow,
    providerId: provider?.id ?? null,
    sessionId: session?.id ?? null,
    visibleMessages,
  });

  const conversationStatus =
    provider && session
      ? resolveConversationStatus({
          interrupting: state.interrupting,
          lifecycle: state.sendLifecycle,
          loading: state.loading || (provider.id === "codex" && !state.threadState),
          pendingUserInputRequests: state.pendingUserInputRequests,
          providerId: provider.id,
          respondingRequestId: state.respondingRequestId,
          sendAvailable: provider.status.sendAvailable,
          streamStatus: state.streamStatus,
          threadState: state.threadState,
        })
      : null;
  const hasRenderableMessages = useMemo(
    () => state.messages.some((message) => !isOptimisticUserMessage(message)),
    [state.messages],
  );

  useEffect(() => {
    onConversationStreamStatusChange?.({
      conversationStatusPhase: conversationStatus?.phase ?? null,
      hasRenderableMessages,
      providerId: provider?.id ?? null,
      sessionId: session?.id ?? null,
      streamStatus:
        provider?.capabilities.stream && session ? state.streamStatus : null,
    });
  }, [
    onConversationStreamStatusChange,
    conversationStatus?.phase,
    hasRenderableMessages,
    provider?.capabilities.stream,
    provider?.id,
    session?.id,
    state.streamStatus.phase,
    state.streamStatus.retryCount,
  ]);

  useEffect(() => {
    setSearchOpen(false);
    setComposerBrowseCollapsed(false);
    setMessageViewModeBackfillTarget(null);
    setMessageViewModeSwitching(false);
    setRecoveringConversation(false);
    setShowRuntimeRestart(false);
    clearSearch();
  }, [clearSearch, provider?.id, session?.id]);

  useEffect(() => {
    if (conversationStatus?.phase !== "stalled") {
      setRecoveringConversation(false);
      setShowRuntimeRestart(false);
    }
  }, [conversationStatus?.phase]);

  useEffect(() => {
    writeConversationReadingPreference(getBrowserStorage(), {
      composerStoredHeight,
      headerCollapsed,
      messageFontScale,
      messageViewMode,
    });
  }, [composerStoredHeight, headerCollapsed, messageFontScale, messageViewMode]);

  useEffect(() => {
    const action = resolveMessageViewModeBackfillAction({
      hasOlderMessages,
      loading: state.loading,
      loadingOlder: state.loadingOlder,
      targetVisibleCount: messageViewModeBackfillTarget,
      visibleCount: visibleMessages.length,
    });
    if (action === "clear") {
      setMessageViewModeBackfillTarget(null);
      return;
    }
    if (action === "load") {
      handleLoadOlder().catch(console.error);
    }
  }, [
    handleLoadOlder,
    hasOlderMessages,
    messageViewModeBackfillTarget,
    state.loading,
    state.loadingOlder,
    visibleMessages.length,
  ]);

  const isAllSearchActive = searchOpen && searchScope === "all" && searchQuery.trim().length > 0;
  const searchMode: "off" | "all-results" | "all-context" = isAllSearchActive
    ? (showSearchResultsPage ? "all-results" : "all-context")
    : "off";

  const handleSearchEsc = useCallback(() => {
    if (searchMode === "all-context") {
      reopenAllSearchResults();
    } else {
      setSearchOpen(false);
      clearSearch();
    }
  }, [clearSearch, reopenAllSearchResults, searchMode]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      handleSearchEsc();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSearchEsc, searchOpen]);

  if (!provider || !session || !conversationStatus) {
    return (
      <EmptyConversationState
        provider={provider}
        onOpenBrowser={onOpenBrowser}
      />
    );
  }

  async function handleRecoverConversation() {
    if (recoveringConversation) {
      return;
    }

    setRecoveringConversation(true);
    try {
      await handleInterrupt();
    } catch (cause) {
      console.error(cause);
    } finally {
      setRecoveringConversation(false);
      setShowRuntimeRestart(true);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-transparent">
      <ConversationHeader
        collapsed={headerCollapsed}
        conversationStatus={conversationStatus}
        searchActiveIndex={activeHitIndex}
        searchError={searchError}
        searchLoading={searchLoading}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        searchScope={searchScope}
        searchStatusLabel={searchStatusLabel}
        session={session}
        onCloseSearch={() => {
          setSearchOpen(false);
          clearSearch();
        }}
        onEscSearch={searchOpen ? handleSearchEsc : undefined}
        onNextSearchHit={() => {
          goToNextHit().catch(console.error);
        }}
        onPreviousSearchHit={() => {
          goToPreviousHit().catch(console.error);
        }}
        onSearchQueryChange={setSearchQuery}
        onSearchScopeChange={setSearchScope}
        onToggleCollapsed={() => {
          setHeaderCollapsed((current) => {
            const next = !current;
            if (next && searchOpen) {
              setSearchOpen(false);
              clearSearch();
            }
            return next;
          });
        }}
        onToggleDesktopSidebar={onToggleDesktopSidebar}
        onToggleSearch={() => {
          setSearchOpen((current) => {
            if (current) {
              clearSearch();
            }
            return !current;
          });
        }}
      />
      <ConversationBody
        canInterrupt={canInterruptConversation({
          interruptAvailable: provider.capabilities.interrupt,
          loading: state.loading,
          sendLifecycle: state.sendLifecycle,
          streamStatus: state.streamStatus,
          threadState: state.threadState,
        })}
        conversationStatus={conversationStatus}
        contextDetails={contextDetails}
        contextLabel={contextLabel}
        draft={draft}
        effortOptions={effortOptions}
        error={voiceError ?? state.error}
        hasOlderMessages={hasOlderMessages}
        hasBufferedLatest={Boolean(state.bufferedConversationWindow)}
        imageUploadEnabled={provider.id === "codex" && provider.status.sendAvailable}
        loading={state.loading}
        loadingOlder={state.loadingOlder}
        messageFontScale={messageFontScale}
        messageWindowFrozen={state.messageWindowFrozen}
        messageViewMode={messageViewMode}
        messages={visibleMessages}
        modelOptions={modelOptions}
        olderLoadCount={state.olderLoadCount}
        pendingImages={images}
        onBrowseMessages={() => {
          setComposerBrowseCollapsed(true);
        }}
        pendingUserInputRequests={
          messageViewMode === "all" ? state.pendingUserInputRequests : []
        }
        providerSendAvailable={provider.status.sendAvailable}
        recoveringConversation={recoveringConversation}
        refreshing={refreshing}
        modeSwitching={messageViewModeSwitching}
        respondingRequestId={state.respondingRequestId}
        interrupting={state.interrupting}
        onRecoverConversation={() => {
          handleRecoverConversation().catch(console.error);
        }}
        onRestartRuntime={() => {
          onRestartRuntime?.().catch(console.error);
        }}
        searchContextLoading={searchContextLoading}
        searchMode={searchMode}
        searchResultsPage={
          <ConversationSearchResultsPage
            activeHitIndex={activeHitIndex}
            activeMessageId={activeMessageId}
            error={searchError}
            fontScale={messageFontScale}
            hits={searchPageHits}
            loading={searchLoading}
            onOpenHit={(hit) => {
              openAllSearchHit(hit).catch(console.error);
            }}
            totalHits={searchPageTotalHits}
          />
        }
        searchHitLabel={searchPageCountLabel}
        selectedEffort={selectedEffort}
        selectedModelId={selectedModelId}
        sessionId={session.id}
        sending={state.sending}
        showRuntimeRestart={showRuntimeRestart}
        onReturnToSearchResults={reopenAllSearchResults}
        summary={messageViewMode === "all" ? state.summary : null}
        voicePhase={voicePhase}
        restartingRuntime={restartingRuntime}
        activeSearchMessageId={activeMessageId}
        composerBrowseCollapsed={composerBrowseCollapsed}
        composerStoredHeight={composerStoredHeight}
        onDraftChange={setDraft}
        highlightQuery={searchQuery}
        onInterrupt={() => {
          handleInterrupt().catch(console.error);
        }}
        onLoadOlder={() => {
          handleLoadOlder().catch(console.error);
        }}
        onLoadOlderToStart={() => {
          handleLoadOlderToStart().catch(console.error);
        }}
        onComposerExpand={() => {
          setComposerBrowseCollapsed(false);
        }}
        onComposerStoredHeightChange={setComposerStoredHeight}
        onMessageWindowFrozenChange={handleMessageWindowFrozenChange}
        onPendingImagesChange={setImages}
        onRespondUserInput={(request, questionId, optionLabel) => {
          handleRespondUserInput(request, questionId, optionLabel).catch(console.error);
        }}
        matchedSearchMessageIds={matchedMessageIds}
        onSelectEffort={onSelectEffort}
        onSelectModel={onSelectModel}
        onSend={() => {
          handleSend().catch(console.error);
        }}
        onViewLatest={handleViewLatest}
        onDecreaseFontScale={() => {
          setMessageFontScale((current) => current <= 1 ? 6 : current - 1);
        }}
        onIncreaseFontScale={() => {
          setMessageFontScale((current) => cycleMessageFontScale(current));
        }}
        onCycleMessageViewMode={() => {
          if (messageViewModeSwitching) {
            return;
          }
          const nextMode = cycleMessageViewMode(messageViewMode);
          const previousVisibleCount = visibleMessages.length;
          messageViewModeRef.current = nextMode;
          setMessageViewModeBackfillTarget(null);
          setMessageViewModeSwitching(true);
          setMessageViewMode(nextMode);
          handleRefreshConversation(nextMode)
            .then((refreshed) => {
              if (!refreshed || messageViewModeRef.current !== nextMode) {
                return;
              }
              setMessageViewModeBackfillTarget(previousVisibleCount);
            })
            .catch(console.error)
            .finally(() => {
              setMessageViewModeSwitching((current) =>
                messageViewModeRef.current === nextMode ? false : current,
              );
            });
        }}
        onVoiceClick={() => {
          handleVoiceClick().catch(console.error);
        }}
      />
    </section>
  );
}
