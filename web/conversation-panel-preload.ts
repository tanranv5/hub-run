import type { ProviderId, SessionSummary } from "../api/types";
import { isDraftSession } from "./draft-session";
import { loadInitialPage } from "./conversation-panel-state-ops";
import {
  readSessionPanelCache,
  writeSessionPanelCache,
  type SessionPanelCacheEntry,
} from "./conversation-panel-session-cache";

export async function preloadSessionPanelCache(props: {
  cache: Map<string, SessionPanelCacheEntry>;
  loadPage?: typeof loadInitialPage;
  providerId: ProviderId;
  session: SessionSummary;
}) {
  const {
    cache,
    loadPage = loadInitialPage,
    providerId,
    session,
  } = props;
  if (isDraftSession(session)) {
    return;
  }

  let nextState;
  try {
    nextState = await loadPage(providerId, session.id);
  } catch {
    // Preload is best-effort — ignore errors (e.g. empty sessions not yet materialized)
    return;
  }
  const cached = readSessionPanelCache(cache, providerId, session.id);
  writeSessionPanelCache(
    cache,
    providerId,
    session.id,
    nextState,
    cached?.draft ?? "",
    { skipReloadOnce: true },
  );
}
