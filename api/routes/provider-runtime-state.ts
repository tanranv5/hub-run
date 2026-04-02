import type {
  ConversationMessage,
  ProviderAdapter,
  ProviderId,
  ProviderThreadState,
  ProviderThreadStallReason,
  ProviderTurnStatus,
} from "../types";

const STATE_DESYNC_TOLERANCE_MS = 5_000;
const ACTIVE_MESSAGE_TOLERANCE_MS = 30_000;
const ACTIVE_FILE_WRITE_TOLERANCE_MS = 60_000;
const STALLED_ACTIVITY_TOLERANCE_MS = 120_000;

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

interface RuntimeActivitySnapshot {
  fileMtime: number | null;
  hasPendingUserInputRequests: boolean;
  latestMessageTimestamp: number | null;
  snapshotAt: number | null;
}

function isLatestCodexTurn(
  providerId: ProviderId,
  requestedTurnId: string | null,
  threadState: ProviderThreadState,
) {
  return (
    providerId === "codex" &&
    (requestedTurnId === null || requestedTurnId === threadState.requestedTurnId)
  );
}

function getLastActivityTimestamp(activity: RuntimeActivitySnapshot) {
  const candidates = [
    activity.snapshotAt,
    activity.latestMessageTimestamp,
    activity.fileMtime,
  ].filter((value): value is number => value !== null);
  if (candidates.length === 0) {
    return null;
  }
  return Math.max(...candidates);
}

function toIsoTimestamp(value: number | null) {
  return value === null ? null : new Date(value).toISOString();
}

async function readRuntimeActivitySnapshot(
  adapter: ProviderAdapter & {
    getThreadState: NonNullable<ProviderAdapter["getThreadState"]>;
  },
  sessionId: string,
  snapshotAt: number | null,
): Promise<RuntimeActivitySnapshot> {
  const [page, fileMtime, pendingUserInputRequests] = await Promise.all([
    adapter.getConversationPage(sessionId, null, 1),
    adapter.getSessionFileMtime
      ? adapter.getSessionFileMtime(sessionId)
      : Promise.resolve(null),
    adapter.listUserInputRequests
      ? adapter.listUserInputRequests(sessionId)
      : Promise.resolve([]),
  ]);
  return {
    fileMtime,
    hasPendingUserInputRequests: pendingUserInputRequests.length > 0,
    latestMessageTimestamp: getLatestMessageTimestamp(page.messages),
    snapshotAt,
  };
}

function buildStalledThreadState(
  threadState: ProviderThreadState,
  activity: RuntimeActivitySnapshot,
  stallReason: ProviderThreadStallReason,
) {
  const lastActivityAt = getLastActivityTimestamp(activity);
  if (lastActivityAt === null) {
    return null;
  }
  return {
    ...threadState,
    stalled: true,
    stallReason,
    ...(toIsoTimestamp(activity.latestMessageTimestamp)
      ? { latestMessageAt: toIsoTimestamp(activity.latestMessageTimestamp) }
      : {}),
    lastActivityAt: new Date(lastActivityAt).toISOString(),
  } satisfies ProviderThreadState;
}

function resolvePotentialStalledThreadState(
  threadState: ProviderThreadState,
  activity: RuntimeActivitySnapshot,
  now: number,
) {
  if (
    threadState.requestedTurnId === null ||
    isTerminalTurnStatus(threadState.requestedTurnStatus) ||
    activity.hasPendingUserInputRequests
  ) {
    return null;
  }
  const lastActivityAt = getLastActivityTimestamp(activity);
  if (
    lastActivityAt === null ||
    lastActivityAt > now - STALLED_ACTIVITY_TOLERANCE_MS
  ) {
    return null;
  }
  return buildStalledThreadState(threadState, activity, "noRecentActivity");
}

function resolvePotentialTerminalDesyncThreadState(
  threadState: ProviderThreadState,
  activity: RuntimeActivitySnapshot,
  now: number,
) {
  if (!isTerminalTurnStatus(threadState.requestedTurnStatus)) {
    return null;
  }

  if (
    activity.fileMtime !== null &&
    activity.fileMtime >= now - ACTIVE_FILE_WRITE_TOLERANCE_MS
  ) {
    return {
      ...threadState,
      requestedTurnStatus: null,
      rawRequestedTurnStatus: threadState.requestedTurnStatus,
      desynced: true,
      desyncReason: "activeFileWriteWithInterruptedTurn",
      latestMessageAt: new Date(activity.fileMtime).toISOString(),
    } satisfies ProviderThreadState;
  }

  if (activity.snapshotAt === null) {
    if (
      activity.latestMessageTimestamp !== null &&
      activity.latestMessageTimestamp >= now - ACTIVE_MESSAGE_TOLERANCE_MS
    ) {
      return {
        ...threadState,
        requestedTurnStatus: null,
        rawRequestedTurnStatus: threadState.requestedTurnStatus,
        desynced: true,
        desyncReason: "recentMessagesWithNoSnapshot",
        latestMessageAt: new Date(activity.latestMessageTimestamp).toISOString(),
      } satisfies ProviderThreadState;
    }
    return null;
  }

  if (
    activity.latestMessageTimestamp === null ||
    activity.latestMessageTimestamp <= activity.snapshotAt + STATE_DESYNC_TOLERANCE_MS
  ) {
    return null;
  }

  return {
    ...threadState,
    requestedTurnStatus: null,
    rawRequestedTurnStatus: threadState.requestedTurnStatus,
    desynced: true,
    desyncReason: "messageTailAheadOfThreadSnapshot",
    latestMessageAt: new Date(activity.latestMessageTimestamp).toISOString(),
  } satisfies ProviderThreadState;
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
  if (!isLatestCodexTurn(providerId, requestedTurnId, threadState)) {
    return threadState;
  }

  const snapshotAt = parseTimestamp(threadState.snapshotAt ?? null);
  const activity = await readRuntimeActivitySnapshot(adapter, sessionId, snapshotAt);
  const now = Date.now();
  return (
    resolvePotentialStalledThreadState(threadState, activity, now) ??
    resolvePotentialTerminalDesyncThreadState(threadState, activity, now) ??
    threadState
  );
}
