import type {
  ConversationMessage,
  ProviderAdapter,
  ProviderId,
  ProviderThreadState,
  ProviderTurnStatus,
} from "../types";

const STATE_DESYNC_TOLERANCE_MS = 5_000;
const ACTIVE_MESSAGE_TOLERANCE_MS = 30_000;

function isTerminalTurnStatus(
  status: ProviderTurnStatus | null,
): status is Exclude<ProviderTurnStatus, "inProgress"> {
  return status === "completed" || status === "failed" || status === "interrupted";
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getLatestMessageTimestamp(messages: ConversationMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const parsed = parseTimestamp(messages[index]?.timestamp ?? null);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

export async function resolveProviderThreadStateSnapshot(props: {
  adapter: ProviderAdapter & {
    getThreadState: NonNullable<ProviderAdapter["getThreadState"]>;
  };
  providerId: ProviderId;
  requestedTurnId: string | null;
  sessionId: string;
}) {
  const { adapter, providerId, requestedTurnId, sessionId } = props;
  const threadState = await adapter.getThreadState(sessionId, requestedTurnId);
  if (
    providerId !== "codex" ||
    requestedTurnId !== null ||
    threadState.isGenerating ||
    !isTerminalTurnStatus(threadState.requestedTurnStatus)
  ) {
    return threadState;
  }

  const snapshotAt = parseTimestamp(threadState.snapshotAt ?? null);

  const page = await adapter.getConversationPage(sessionId, null, 1);
  const latestMessageTimestamp = getLatestMessageTimestamp(page.messages);

  if (snapshotAt === null) {
    // app-server 未提供 updatedAt，用消息活跃度判断：若有近期消息则认为 desynced
    if (
      latestMessageTimestamp !== null &&
      latestMessageTimestamp >= Date.now() - ACTIVE_MESSAGE_TOLERANCE_MS
    ) {
      return {
        ...threadState,
        requestedTurnStatus: null,
        rawRequestedTurnStatus: threadState.requestedTurnStatus,
        desynced: true,
        desyncReason: "recentMessagesWithNoSnapshot",
        latestMessageAt: new Date(latestMessageTimestamp).toISOString(),
      } satisfies ProviderThreadState;
    }
    return threadState;
  }

  if (
    latestMessageTimestamp === null ||
    latestMessageTimestamp <= snapshotAt + STATE_DESYNC_TOLERANCE_MS
  ) {
    return threadState;
  }

  return {
    ...threadState,
    requestedTurnStatus: null,
    rawRequestedTurnStatus: threadState.requestedTurnStatus,
    desynced: true,
    desyncReason: "messageTailAheadOfThreadSnapshot",
    latestMessageAt: new Date(latestMessageTimestamp).toISOString(),
  } satisfies ProviderThreadState;
}
