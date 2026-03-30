import type {
  ProviderId,
  ProviderSessionsStreamUpdate,
  SessionsPage,
} from "../api/types";
import type { BrowserState } from "./browser-state";
import { resolvePreferredSessionForProject } from "./browser-state";
import { createLiveRealtimeStreamStatus } from "./realtime-stream-status";
import { mergePreferredSession } from "./ui-preferences";

function resolveSelectedSessionId(
  currentSelectedSessionId: string | null,
  sessions: BrowserState["sessions"],
) {
  if (
    currentSelectedSessionId &&
    sessions.some((session) => session.id === currentSelectedSessionId)
  ) {
    return currentSelectedSessionId;
  }
  return sessions[0]?.id ?? null;
}

export function buildSessionsStreamUrl(
  providerId: ProviderId,
  loaded: number,
  project: string | null,
) {
  const search = new URLSearchParams();
  search.set("loaded", String(Math.max(1, loaded)));
  if (project) {
    search.set("project", project);
  }
  return `/api/providers/${providerId}/sessions/stream?${search.toString()}`;
}

export function applySessionsSnapshot(
  current: BrowserState,
  snapshot: SessionsPage,
  project: string | null = null,
): BrowserState {
  const preferredSession = resolvePreferredSessionForProject(
    current.sessions.find((session) => session.id === current.selectedSessionId) ?? null,
    project,
  );
  const snapshotSessions = snapshot.sessions.filter(
    (session) => !current.deletedSessionIds.has(session.id),
  );
  const sessions = mergePreferredSession(snapshotSessions, preferredSession);
  return {
    ...current,
    sessions,
    nextBefore: snapshot.nextBefore,
    totalSessionCount: snapshot.totalCount ?? sessions.length,
    selectedSessionId: resolveSelectedSessionId(
      current.selectedSessionId,
      sessions,
    ),
    streamStatus: createLiveRealtimeStreamStatus(Date.now()),
    loading: false,
    loadingMore: false,
    error: null,
  };
}

export function applySessionsUpdate(
  current: BrowserState,
  update: ProviderSessionsStreamUpdate,
): BrowserState {
  const sessions = new Map(current.sessions.map((session) => [session.id, session]));
  for (const removedId of update.removedIds) {
    sessions.delete(removedId);
  }
  for (const session of update.upserts) {
    if (!current.deletedSessionIds.has(session.id)) {
      sessions.set(session.id, session);
    }
  }

  const nextSessions = [...sessions.values()].sort(
    (left, right) => right.timestamp - left.timestamp,
  );
  return {
    ...current,
    sessions: nextSessions,
    nextBefore: update.nextBefore,
    totalSessionCount:
      update.totalCount ?? current.totalSessionCount ?? nextSessions.length,
    selectedSessionId: resolveSelectedSessionId(
      current.selectedSessionId,
      nextSessions,
    ),
    streamStatus: createLiveRealtimeStreamStatus(Date.now()),
    loading: false,
    error: null,
  };
}
