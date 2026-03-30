import type { ProviderSummary, SessionSummary } from "../api/types";
import { getProviderSessions } from "./api";
import {
  createIdleRealtimeStreamStatus,
  type RealtimeStreamStatus,
} from "./realtime-stream-status";
import { mergePreferredSession } from "./ui-preferences";

export interface BrowserState {
  sessions: SessionSummary[];
  deletedSessionIds: Set<string>;
  nextBefore: string | null;
  totalSessionCount?: number | null;
  selectedSessionId: string | null;
  streamStatus: RealtimeStreamStatus;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

export const INITIAL_BROWSER: BrowserState = {
  sessions: [],
  deletedSessionIds: new Set(),
  nextBefore: null,
  totalSessionCount: 0,
  selectedSessionId: null,
  streamStatus: createIdleRealtimeStreamStatus(),
  loading: false,
  loadingMore: false,
  error: null,
};

export const SESSION_PAGE_SIZE = 10;

export function findDefaultProvider(providers: ProviderSummary[]) {
  return providers[0]?.id ?? null;
}

export async function loadProviderBrowser(
  provider: ProviderSummary,
  preferredSessionId: string | null,
  preferredSession: SessionSummary | null,
  project: string | null,
) {
  const page = await getProviderSessions(
    provider.id,
    null,
    SESSION_PAGE_SIZE,
    project,
  );
  const nextPreferredSession = resolvePreferredSessionForProject(
    preferredSession,
    project,
  );
  const sessions = mergePreferredSession(page.sessions, nextPreferredSession);
  const selectedSessionId = resolveInitialSelectedSessionId(
    sessions,
    preferredSessionId,
    nextPreferredSession,
  );

  return {
    sessions,
    nextBefore: page.nextBefore,
    totalSessionCount: page.totalCount ?? sessions.length,
    selectedSessionId,
    streamStatus: createIdleRealtimeStreamStatus(),
    loading: false,
    loadingMore: false,
    error: null,
  } satisfies BrowserState;
}

export function resolvePreferredSessionForProject(
  preferredSession: SessionSummary | null,
  project: string | null,
) {
  if (!preferredSession) {
    return null;
  }
  if (!project) {
    return preferredSession;
  }
  return preferredSession.project === project ? preferredSession : null;
}

export function resolveInitialSelectedSessionId(
  sessions: SessionSummary[],
  preferredSessionId: string | null,
  preferredSession: SessionSummary | null,
) {
  const preferredId = preferredSessionId ?? preferredSession?.id ?? null;
  if (preferredId && sessions.some((session) => session.id === preferredId)) {
    return preferredId;
  }
  return sessions[0]?.id ?? null;
}
