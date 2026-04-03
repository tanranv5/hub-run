import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type {
  ConversationLocateResult,
  ProviderUserInputRequest,
  SendImageInput,
  SendMessageInput,
  SessionSummary,
} from "../api/types";
import { interruptProviderSession } from "./api";
import {
  bootstrapConversationPanel,
  type SessionIdentity,
} from "./conversation-panel-bootstrap";
import {
  respondToUserInputOption,
} from "./conversation-panel-codex-runtime";
import { applyBufferedConversationWindow } from "./conversation-stream-state";
import { useConversationStream } from "./use-conversation-stream";
import { useConversationRuntimeStream } from "./use-conversation-runtime-stream";
import { isDraftSession } from "./draft-session";
import {
  getErrorMessage,
  loadOlderMessages,
  loadOlderMessagesUntilStart,
} from "./conversation-panel-state-ops";
import { interruptConversationTurn } from "./conversation-panel-interrupt";
import {
  PANEL_REFRESH_INTERVAL_MS,
  pollLatestConversation,
  shouldRefreshConversationDuringRuntime,
} from "./conversation-panel-poll-state";
import { sendConversation } from "./conversation-panel-send-ops";
import type { SessionPanelCacheEntry } from "./conversation-panel-session-cache";
import {
  applySessionPanelUpdate,
  type DetachedSessionUpdate,
} from "./conversation-panel-session-sync";
import {
  INITIAL_PANEL_STATE,
  type PanelState,
  type SendConversationResult,
  type BufferedConversationWindow,
} from "./conversation-panel-state-types";
import { isSendLifecycleActive } from "./conversation-send-state";

function readCurrentConversationWindow(state: PanelState): BufferedConversationWindow {
  return state.bufferedConversationWindow ?? {
    messages: state.messages,
    nextBefore: state.nextBefore,
    summary: state.summary,
    streamOffset: state.streamOffset,
  };
}

export function useConversationPanelState(props: {
  providerId: "codex" | "claude" | null;
  refreshVersion: number;
  sessionCacheRef: MutableRefObject<Map<string, SessionPanelCacheEntry>>;
  sendMessage: (input: SendMessageInput) => Promise<SendConversationResult>;
  session: SessionSummary | null;
  streamAvailable: boolean;
  onMessageSent: (sessionId: string, initialDisplay?: string | null) => Promise<void>;
}) {
  const {
    onMessageSent,
    providerId,
    refreshVersion,
    sessionCacheRef,
    sendMessage: onSendMessage,
    session,
    streamAvailable,
  } = props;
  const [state, setState] = useState<PanelState>(INITIAL_PANEL_STATE);
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<SendImageInput[]>([]);
  const draftRef = useRef(draft);
  const generationRef = useRef(0);
  const previousSessionRef = useRef<SessionIdentity | null>(null);
  const activeSessionRef = useRef<SessionIdentity | null>(null);
  const stateRef = useRef(state);

  stateRef.current = state;
  draftRef.current = draft;
  activeSessionRef.current =
    providerId && session
      ? {
          providerId,
          sessionId: session.id,
        }
      : null;

  useConversationStream({
    enabled: Boolean(streamAvailable && providerId && session && !isDraftSession(session)),
    providerId,
    refreshVersion,
    sessionId: session?.id ?? null,
    setState,
  });
  useConversationRuntimeStream({
    enabled: Boolean(providerId === "codex" && session && !isDraftSession(session)),
    providerId,
    refreshVersion,
    sessionId: session?.id ?? null,
    setState,
  });

  useLayoutEffect(() => {
    setImages([]);
    bootstrapConversationPanel({
      generationRef,
      previousSessionRef,
      providerId,
      session,
      sessionCacheRef,
      setDraft,
      setState,
      stateRef,
      draftRef,
    });
  }, [providerId, refreshVersion, session?.id, session?.isDraft]);

  useEffect(() => {
    if (!providerId || !session || isDraftSession(session) || streamAvailable) {
      return;
    }

    const generation = generationRef.current;
    const shouldAbort = () => generation !== generationRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      timer = setTimeout(poll, PANEL_REFRESH_INTERVAL_MS);
    };

    const poll = () => {
      pollLatestConversation({
        providerId,
        sessionId: session.id,
        setState,
        shouldAbort,
      })
        .catch((cause) => {
          if (shouldAbort()) {
            return;
          }
          setState((current) => ({
            ...current,
            error: getErrorMessage(cause, "Failed to refresh conversation"),
          }));
        })
        .finally(() => {
          if (!shouldAbort()) {
            scheduleNext();
          }
        });
    };

    scheduleNext();

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [providerId, session?.id, session?.isDraft, streamAvailable]);

  useEffect(() => {
    if (
      !providerId ||
      !session ||
      isDraftSession(session) ||
      !streamAvailable ||
      !shouldRefreshConversationDuringRuntime({
        current: state,
        now: Date.now(),
        streamAvailable,
      })
    ) {
      return;
    }

    const generation = generationRef.current;
    let cancelled = false;
    const shouldAbort = () => cancelled || generation !== generationRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const pollRuntimeFallback = () => {
      if (
        shouldAbort() ||
        !shouldRefreshConversationDuringRuntime({
          current: stateRef.current,
          now: Date.now(),
          streamAvailable,
        })
      ) {
        return;
      }

      pollLatestConversation({
        includeRuntime: false,
        providerId,
        sessionId: session.id,
        setState,
        shouldAbort,
      })
        .catch((cause) => {
          if (shouldAbort()) {
            return;
          }
          setState((current) => ({
            ...current,
            error: getErrorMessage(cause, "Failed to refresh conversation"),
          }));
        })
        .finally(() => {
          if (!shouldAbort()) {
            timer = setTimeout(pollRuntimeFallback, PANEL_REFRESH_INTERVAL_MS);
          }
        });
    };

    timer = setTimeout(pollRuntimeFallback, PANEL_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    providerId,
    session?.id,
    session?.isDraft,
    state.loading,
    state.loadingOlder,
    state.pendingUserInputRequests.length,
    state.pendingTerminalSyncTurnId,
    state.sending,
    state.streamStatus.phase,
    state.streamStatus.lastEventAt,
    streamAvailable,
  ]);

  const hasOlderMessages = useMemo(() => Boolean(state.nextBefore), [state.nextBefore]);

  async function handleLoadOlder() {
    if (!providerId || !session || !state.nextBefore || state.loadingOlder) {
      return;
    }

    setState((current) => ({
      ...current,
      messageWindowFrozen: true,
      olderLoadCount: current.olderLoadCount + 1,
    }));
    await loadOlderMessages({
      nextBefore: state.nextBefore,
      providerId,
      sessionId: session.id,
      setState,
    });
  }

  async function handleLoadOlderToStart() {
    if (!providerId || !session || !state.nextBefore || state.loadingOlder) {
      return;
    }

    setState((current) => ({
      ...current,
      messageWindowFrozen: true,
    }));
    await loadOlderMessagesUntilStart({
      nextBefore: state.nextBefore,
      providerId,
      sessionId: session.id,
      setState,
    });
  }

  async function handleSend() {
    if (!providerId || !session || state.sending) {
      return;
    }

    const generation = generationRef.current;
    const updateDetachedSession = (update: DetachedSessionUpdate) => {
      const applied = applySessionPanelUpdate({
        activeProviderId: activeSessionRef.current?.providerId ?? null,
        activeSessionId: activeSessionRef.current?.sessionId ?? null,
        cache: sessionCacheRef.current,
        currentDraft: draftRef.current,
        currentState: stateRef.current,
        providerId,
        sessionId: session.id,
        update,
      });
      if (!applied.isActive) {
        return;
      }
      if (update.draft !== undefined) {
        setDraft(applied.nextDraft);
      }
      if (update.updateState) {
        setState(applied.nextState);
      }
    };
    await sendConversation({
      draft,
      images,
      onMessageSent,
      onSendMessage,
      providerId,
      session,
      streamAvailable,
      setDraft,
      setImages,
      setState,
      shouldAbort: () => generation !== generationRef.current,
      updateDetachedSession,
    });
  }

  async function handleInterrupt() {
    const canInterruptCurrentTurn =
      state.threadState?.isGenerating === true ||
      state.threadState?.stalled === true ||
      (state.sendLifecycle !== null &&
        (isSendLifecycleActive(state.sendLifecycle) ||
          state.sendLifecycle.phase === "timedOut"));
    if (!providerId || !session || !canInterruptCurrentTurn || state.interrupting) {
      return;
    }

    const generation = generationRef.current;
    await interruptConversationTurn({
      providerId,
      sessionId: session.id,
      setState,
      shouldAbort: () => generation !== generationRef.current,
    });
  }

  async function handleRespondUserInput(
    request: ProviderUserInputRequest,
    questionId: string,
    optionLabel: string,
  ) {
    if (!providerId || !session) {
      return;
    }

    const generation = generationRef.current;
    await respondToUserInputOption({
      optionLabel,
      providerId,
      questionId,
      request,
      sessionId: session.id,
      setState,
      shouldAbort: () => generation !== generationRef.current,
    });
  }

  return {
    draft,
    hasOlderMessages,
    handleInterrupt,
    handleLoadOlder,
    handleLoadOlderToStart,
    images,
    handleRespondUserInput,
    handleSend,
    handleViewLatest: () => {
      setState((current) => applyBufferedConversationWindow(current));
    },
    handleShowLocatedWindow: (result: ConversationLocateResult) => {
      setState((current) => ({
        ...current,
        messages: result.messages,
        nextBefore: null,
        summary: null,
        messageWindowFrozen: true,
        bufferedConversationWindow: readCurrentConversationWindow(current),
      }));
    },
    handleMessageWindowFrozenChange: (frozen: boolean) => {
      setState((current) => {
        if (frozen) {
          return current.messageWindowFrozen
            ? current
            : { ...current, messageWindowFrozen: true };
        }
        if (current.bufferedConversationWindow) {
          return current;
        }
        return current.messageWindowFrozen
          ? { ...current, messageWindowFrozen: false }
          : current;
      });
    },
    setDraft,
    setImages,
    state,
  };
}
