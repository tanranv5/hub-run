import type {
  ConversationSearchMode,
  ProviderId,
  ProviderReasoningEffort,
  SessionSummary,
} from "../api/types";

export interface ProviderControlPreference {
  modelId: string | null;
  effort: ProviderReasoningEffort | null;
}

export interface ConversationReadingPreference {
  composerStoredHeight: number | null;
  messageFontScale: number;
  messageViewMode: ConversationSearchMode;
}

interface StorageLike {
  getItem(key: string): string | null;
  key?(index: number): string | null;
  length?: number;
  removeItem?(key: string): void;
  setItem(key: string, value: string): void;
}

const SESSION_KEY_PREFIX = "hub-run:selected-session:v1";
const CONTROL_KEY_PREFIX = "hub-run:provider-controls:v1";
const READING_PREFERENCE_KEY = "hub-run:conversation-reading:v1";

export function getBrowserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readSelectedSessionPreference(
  storage: StorageLike | null | undefined,
  providerId: ProviderId,
  project: string | null,
): SessionSummary | null {
  if (!storage) {
    return null;
  }

  const exact = readJsonValue<SessionSummary>(storage, buildSessionKey(providerId, project));
  if (exact) {
    return exact;
  }
  if (project) {
    return null;
  }

  const providerWide = readJsonValue<SessionSummary>(storage, buildSessionKey(providerId, null));
  if (providerWide) {
    return providerWide;
  }

  return findLatestProviderSessionPreference(storage, providerId);
}

export function writeSelectedSessionPreference(
  storage: StorageLike | null | undefined,
  providerId: ProviderId,
  project: string | null,
  session: SessionSummary,
) {
  writeJsonValue(storage, buildSessionKey(providerId, project), session);
  writeJsonValue(storage, buildSessionKey(providerId, null), session);
}

export function clearSelectedSessionPreference(
  storage: StorageLike | null | undefined,
  providerId: ProviderId,
  sessionId: string,
) {
  if (
    !storage ||
    typeof storage.key !== "function" ||
    typeof storage.length !== "number" ||
    typeof storage.removeItem !== "function"
  ) {
    return;
  }

  const prefix = `${SESSION_KEY_PREFIX}:${providerId}:`;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    const session = readJsonValue<SessionSummary>(storage, key);
    if (session?.id === sessionId) {
      storage.removeItem(key);
    }
  }
}

export function readProviderControlPreference(
  storage: StorageLike | null | undefined,
  providerId: ProviderId,
): ProviderControlPreference | null {
  return readJsonValue<ProviderControlPreference>(storage, `${CONTROL_KEY_PREFIX}:${providerId}`);
}

export function writeProviderControlPreference(
  storage: StorageLike | null | undefined,
  providerId: ProviderId,
  preference: ProviderControlPreference,
) {
  writeJsonValue(storage, `${CONTROL_KEY_PREFIX}:${providerId}`, preference);
}

export function mergePreferredSession(
  sessions: SessionSummary[],
  preferredSession: SessionSummary | null,
) {
  if (!preferredSession) {
    return sessions;
  }

  const entries = new Map(sessions.map((session) => [session.id, session]));
  entries.set(preferredSession.id, preferredSession);
  return [...entries.values()].sort((left, right) => right.timestamp - left.timestamp);
}

export function readConversationReadingPreference(
  storage: StorageLike | null | undefined,
): ConversationReadingPreference | null {
  const value = readJsonValue<ConversationReadingPreference>(storage, READING_PREFERENCE_KEY);
  if (!value) {
    return null;
  }
  if (
    (value.messageViewMode !== "all" &&
      value.messageViewMode !== "compact" &&
      value.messageViewMode !== "text") ||
    !Number.isFinite(value.messageFontScale)
  ) {
    storage?.removeItem?.(READING_PREFERENCE_KEY);
    return null;
  }
  return {
    composerStoredHeight:
      typeof value.composerStoredHeight === "number" && Number.isFinite(value.composerStoredHeight)
        ? value.composerStoredHeight
        : null,
    messageFontScale: value.messageFontScale,
    messageViewMode: value.messageViewMode,
  };
}

export function writeConversationReadingPreference(
  storage: StorageLike | null | undefined,
  preference: ConversationReadingPreference,
) {
  writeJsonValue(storage, READING_PREFERENCE_KEY, preference);
}

function buildSessionKey(providerId: ProviderId, project: string | null) {
  return `${SESSION_KEY_PREFIX}:${providerId}:${project ?? "*"}`;
}

function findLatestProviderSessionPreference(
  storage: StorageLike,
  providerId: ProviderId,
) {
  if (typeof storage.key !== "function" || typeof storage.length !== "number") {
    return null;
  }

  const prefix = `${SESSION_KEY_PREFIX}:${providerId}:`;
  let latest: SessionSummary | null = null;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) {
      continue;
    }
    const session = readJsonValue<SessionSummary>(storage, key);
    if (!session) {
      continue;
    }
    if (!latest || session.timestamp > latest.timestamp) {
      latest = session;
    }
  }
  return latest;
}

function readJsonValue<T>(storage: StorageLike | null | undefined, key: string) {
  const raw = storage?.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    storage?.removeItem?.(key);
    return null;
  }
}

function writeJsonValue(
  storage: StorageLike | null | undefined,
  key: string,
  value: unknown,
) {
  storage?.setItem(key, JSON.stringify(value));
}
