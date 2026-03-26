import type {
  ConversationMessage,
  ProviderThreadState,
  ProviderUserInputRequest,
} from "../api/types";
import type { SendLifecycle } from "./conversation-send-state";
import {
  createIdleRealtimeStreamStatus,
  type RealtimeStreamStatus,
} from "./realtime-stream-status";

export interface BufferedConversationWindow {
  messages: ConversationMessage[];
  nextBefore: string | null;
  summary: ConversationMessage | null;
  streamOffset: number | null;
}

export interface PanelState {
  messages: ConversationMessage[];
  nextBefore: string | null;
  streamOffset: number | null;
  streamStatus: RealtimeStreamStatus;
  summary: ConversationMessage | null;
  loading: boolean;
  loadingOlder: boolean;
  sending: boolean;
  sendStatus: string | null;
  sendLifecycle: SendLifecycle | null;
  error: string | null;
  threadState: ProviderThreadState | null;
  pendingUserInputRequests: ProviderUserInputRequest[];
  pendingTerminalSyncTurnId: string | null;
  respondingRequestId: string | null;
  interrupting: boolean;
  messageWindowFrozen: boolean;
  bufferedConversationWindow: BufferedConversationWindow | null;
}

export interface SendConversationResult {
  sessionId: string;
  turnId: string | null;
  outputText: string | null;
}

export const INITIAL_PANEL_STATE: PanelState = {
  messages: [],
  nextBefore: null,
  streamOffset: null,
  streamStatus: createIdleRealtimeStreamStatus(),
  summary: null,
  loading: false,
  loadingOlder: false,
  sending: false,
  sendStatus: null,
  sendLifecycle: null,
  error: null,
  threadState: null,
  pendingUserInputRequests: [],
  pendingTerminalSyncTurnId: null,
  respondingRequestId: null,
  interrupting: false,
  messageWindowFrozen: false,
  bufferedConversationWindow: null,
};
