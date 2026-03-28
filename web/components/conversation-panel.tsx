import { memo, useMemo, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  ConversationMessage,
  ProviderModelOption,
  ProviderReasoningEffort,
  ProviderSummary,
  ProviderThreadState,
  ProviderUserInputRequest,
  SessionSummary,
} from "../../api/types";
import { useConversationPanelState } from "../conversation-panel-state";
import type { SendConversationResult } from "../conversation-panel-state-types";
import type { SessionPanelCacheEntry } from "../conversation-panel-session-cache";
import type { RealtimeStreamStatus } from "../realtime-stream-status";
import { resolveConversationStatus, type ConversationStatus } from "../conversation-status";
import { PanelLoadingState } from "./app-shell";
import ConversationComposer from "./conversation-composer";
import ConversationHeader from "./conversation-header";
import { useVoiceInput } from "../use-voice-input";
import {
  EmptyConversationState,
} from "./conversation-message";
import ConversationTimeline from "./conversation-timeline";

export function canInterruptConversation(props: {
  interruptAvailable: boolean;
  loading: boolean;
  streamStatus: RealtimeStreamStatus;
  threadState: ProviderThreadState | null;
}) {
  const {
    interruptAvailable,
    loading,
    streamStatus: _streamStatus,
    threadState,
  } = props;
  if (loading || !interruptAvailable) {
    return false;
  }
  return threadState?.isGenerating === true;
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
  onMessageSent: (sessionId: string) => Promise<void>;
  onOpenBrowser: () => void;
  onSelectEffort: (value: ProviderReasoningEffort | null) => void;
  onSelectModel: (value: string | null) => void;
  onToggleDesktopSidebar: () => void;
  sendMessage: (text: string) => Promise<SendConversationResult>;
}

interface ConversationBodyProps {
  canInterrupt: boolean;
  contextDetails?: string | null;
  contextLabel?: string | null;
  conversationStatus: ConversationStatus;
  draft: string;
  effortOptions: ProviderReasoningEffort[];
  error: string | null;
  hasOlderMessages: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasBufferedLatest: boolean;
  messages: ConversationMessage[];
  messageWindowFrozen: boolean;
  modelOptions: ProviderModelOption[];
  pendingUserInputRequests: ProviderUserInputRequest[];
  providerSendAvailable: boolean;
  refreshing?: boolean;
  respondingRequestId: string | null;
  interrupting: boolean;
  sessionId?: string | null;
  selectedEffort: ProviderReasoningEffort | null;
  selectedModelId: string | null;
  sending: boolean;
  summary: ConversationMessage | null;
  onDraftChange: (value: string) => void;
  onInterrupt: () => void;
  onLoadOlder: () => void;
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

export const ConversationBody = memo(function ConversationBody(props: ConversationBodyProps) {
  const {
    canInterrupt,
    contextDetails = null,
    contextLabel = null,
    conversationStatus,
    draft,
    effortOptions,
    error,
    hasOlderMessages,
    hasBufferedLatest,
    loading,
    loadingOlder,
    messageWindowFrozen,
    messages,
    modelOptions,
    pendingUserInputRequests,
    onDraftChange,
    onInterrupt,
    onLoadOlder,
    onMessageWindowFrozenChange,
    onRespondUserInput,
    onSelectEffort,
    onSelectModel,
    onSend,
    onViewLatest,
    voicePhase,
    onVoiceClick,
    interrupting,
    providerSendAvailable,
    refreshing = false,
    respondingRequestId,
    sessionId = null,
    selectedEffort,
    selectedModelId,
    sending,
    summary,
  } = props;

  if (loading && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelLoadingState label="正在加载记录..." />
      </div>
    );
  }

  return (
    <div
      aria-busy={refreshing}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      <ConversationTimeline
        error={error}
        hasOlderMessages={hasOlderMessages}
        hasBufferedLatest={hasBufferedLatest}
        loading={loading}
        loadingOlder={loadingOlder}
        messageWindowFrozen={messageWindowFrozen}
        messages={messages}
        pendingUserInputRequests={pendingUserInputRequests}
        respondingRequestId={respondingRequestId}
        sessionId={sessionId}
        summary={summary}
        onLoadOlder={onLoadOlder}
        onSetMessageWindowFrozen={onMessageWindowFrozenChange}
        onRespondUserInput={onRespondUserInput}
        onViewLatest={onViewLatest}
      />
      {providerSendAvailable ? (
        <ConversationComposer
          canInterrupt={canInterrupt}
          contextDetails={contextDetails}
          contextLabel={contextLabel}
          conversationStatus={conversationStatus}
          draft={draft}
          effortOptions={effortOptions}
          interrupting={interrupting}
          modelOptions={modelOptions}
          refreshing={refreshing}
          selectedEffort={selectedEffort}
          selectedModelId={selectedModelId}
          sending={sending}
          voicePhase={voicePhase}
          onDraftChange={onDraftChange}
          onInterrupt={onInterrupt}
          onSelectEffort={onSelectEffort}
          onSelectModel={onSelectModel}
          onSend={onSend}
          onVoiceClick={onVoiceClick}
        />
      ) : null}
      {refreshing ? <ConversationRefreshOverlay /> : null}
    </div>
  );
});

export default function ConversationPanel(props: ConversationPanelProps) {
  const {
    contextDetails = null,
    contextLabel = null,
    effortOptions,
    modelOptions,
    onMessageSent,
    onOpenBrowser,
    onSelectEffort,
    onSelectModel,
    onToggleDesktopSidebar,
    provider,
    refreshVersion = 0,
    refreshing = false,
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
    handleRespondUserInput,
    handleSend,
    handleViewLatest,
    setDraft,
    state,
  } =
    useConversationPanelState({
      providerId: provider?.id ?? null,
      refreshVersion,
      sessionCacheRef,
      sendMessage,
      session,
      streamAvailable: provider?.capabilities.stream ?? false,
      onMessageSent,
    });
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const { handleVoiceClick, voicePhase } = useVoiceInput({
    draft,
    onError: setVoiceError,
    setDraft,
  });

  if (!provider || !session) {
    return (
      <EmptyConversationState
        provider={provider}
        onOpenBrowser={onOpenBrowser}
      />
    );
  }

  const conversationStatus = resolveConversationStatus({
    interrupting: state.interrupting,
    lifecycle: state.sendLifecycle,
    loading: state.loading || (provider.id === "codex" && !state.threadState),
    pendingUserInputRequests: state.pendingUserInputRequests,
    providerId: provider.id,
    respondingRequestId: state.respondingRequestId,
    sendAvailable: provider.status.sendAvailable,
    streamStatus: state.streamStatus,
    threadState: state.threadState,
  });

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <ConversationHeader
        conversationStatus={conversationStatus}
        session={session}
        onToggleDesktopSidebar={onToggleDesktopSidebar}
      />
      <ConversationBody
        canInterrupt={canInterruptConversation({

          interruptAvailable: provider.capabilities.interrupt,
          loading: state.loading,
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
        loading={state.loading}
        loadingOlder={state.loadingOlder}
        messageWindowFrozen={state.messageWindowFrozen}
        messages={state.messages}
        modelOptions={modelOptions}
        pendingUserInputRequests={state.pendingUserInputRequests}
        providerSendAvailable={provider.status.sendAvailable}
        refreshing={refreshing}
        respondingRequestId={state.respondingRequestId}
        interrupting={state.interrupting}
        selectedEffort={selectedEffort}
        selectedModelId={selectedModelId}
        sessionId={session.id}
        sending={state.sending}
        summary={state.summary}
        voicePhase={voicePhase}
        onDraftChange={setDraft}
        onInterrupt={() => {
          handleInterrupt().catch(console.error);
        }}
        onLoadOlder={() => {
          handleLoadOlder().catch(console.error);
        }}
        onMessageWindowFrozenChange={handleMessageWindowFrozenChange}
        onRespondUserInput={(request, questionId, optionLabel) => {
          handleRespondUserInput(request, questionId, optionLabel).catch(console.error);
        }}
        onSelectEffort={onSelectEffort}
        onSelectModel={onSelectModel}
        onSend={() => {
          handleSend().catch(console.error);
        }}
        onViewLatest={handleViewLatest}
        onVoiceClick={() => {
          handleVoiceClick().catch(console.error);
        }}
      />
    </section>
  );
}
