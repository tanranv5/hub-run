import type {
  ProviderId,
  ProviderThreadState,
  ProviderUserInputRequest,
} from "../api/types";
import {
  getProviderThreadState,
  listProviderUserInputRequests,
  respondProviderUserInputRequest,
} from "./api";
import {
  applyPanelRuntimeState,
  resolveSendStatus,
} from "./conversation-panel-send";
import { getErrorMessage } from "./conversation-panel-state-ops";
import type { PanelState } from "./conversation-panel-state-types";
import type { SendLifecycle } from "./conversation-send-state";
import type { Dispatch, SetStateAction } from "react";
import { loadInitialPage } from "./conversation-panel-state-ops";
import { hasConversationChanged } from "./conversation-panel-state-helpers";
import { touchRealtimeStreamActivity } from "./realtime-stream-status";

export function getCodexSendStatus(
  threadState: ProviderThreadState | null,
  pendingUserInputRequests: ProviderUserInputRequest[],
  interrupting: boolean,
  respondingRequestId: string | null,
  lifecycle: SendLifecycle | null = null,
): string | null {
  return resolveSendStatus({
    interrupting,
    lifecycle,
    pendingUserInputRequests,
    providerId: "codex",
    respondingRequestId,
    threadState,
  });
}

export async function loadRuntimeState(
  providerId: ProviderId,
  sessionId: string,
) {
  if (providerId !== "codex") {
    return {
      threadState: null,
      pendingUserInputRequests: [],
    };
  }

  const [threadState, pendingUserInputRequests] = await Promise.all([
    getProviderThreadState(providerId, sessionId, null),
    listProviderUserInputRequests(providerId, sessionId),
  ]);
  return { threadState, pendingUserInputRequests };
}

export async function respondToUserInputOption(props: {
  loadPage?: typeof loadInitialPage;
  optionLabel: string;
  providerId: ProviderId;
  questionId: string;
  request: ProviderUserInputRequest;
  sessionId: string;
  setState: Dispatch<SetStateAction<PanelState>>;
  shouldAbort?: () => boolean;
  submitResponse?: typeof respondProviderUserInputRequest;
}) {
  const {
    loadPage = loadInitialPage,
    optionLabel,
    providerId,
    questionId,
    request,
    sessionId,
    setState,
    shouldAbort = () => false,
    submitResponse = respondProviderUserInputRequest,
  } = props;
  setState((current) => ({
    ...current,
    respondingRequestId: request.requestId,
    sendStatus: "正在提交用户输入...",
    error: null,
  }));

  try {
    await submitResponse(providerId, sessionId, request.requestId, {
      answers: {
        [questionId]: {
          answers: [optionLabel],
        },
      },
    });
    if (shouldAbort()) {
      return;
    }
    const nextState = await loadPage(providerId, sessionId);
    if (shouldAbort()) {
      return;
    }
    setState((current) =>
      mergeReloadedPanelState(current, nextState, providerId, Date.now()),
    );
  } catch (cause) {
    if (shouldAbort()) {
      return;
    }
    setState((current) => ({
      ...current,
      respondingRequestId: null,
      sendStatus: getCodexSendStatus(
        current.threadState,
        current.pendingUserInputRequests,
        current.interrupting,
        null,
        current.sendLifecycle,
      ),
      error: getErrorMessage(cause, "Failed to submit user input"),
    }));
  }
}

function mergeReloadedPanelState(
  current: PanelState,
  nextState: PanelState,
  providerId: ProviderId,
  now: number,
): PanelState {
  const nextInterrupting =
    current.interrupting && nextState.threadState?.isGenerating === true;
  const runtimeMerged = applyPanelRuntimeState(
    {
      ...current,
      interrupting: nextInterrupting,
      respondingRequestId: null,
    },
    providerId,
    nextState.threadState,
    nextState.pendingUserInputRequests,
    now,
  );
  return {
    ...runtimeMerged,
    messages: nextState.messages,
    nextBefore: nextState.nextBefore,
    summary: nextState.summary,
    streamStatus: hasConversationChanged(current.messages, nextState.messages)
      ? touchRealtimeStreamActivity(current.streamStatus, now)
      : current.streamStatus,
    loading: false,
    loadingOlder: false,
    error: null,
    pendingTerminalSyncTurnId: null,
    respondingRequestId: null,
    interrupting: nextInterrupting,
  };
}

export function sameThreadState(current: ProviderThreadState | null, next: ProviderThreadState | null) {
  return JSON.stringify(current) === JSON.stringify(next);
}

export function sameUserInputRequests(
  current: ProviderUserInputRequest[],
  next: ProviderUserInputRequest[],
) {
  return JSON.stringify(current) === JSON.stringify(next);
}
