import type { Dispatch, SetStateAction } from "react";
import { getProviderSessions } from "./api";
import type { BrowserState } from "./browser-state";
import {
  INITIAL_BROWSER,
  loadProviderBrowser,
  resolveInitialSelectedSessionId,
  resolvePreferredSessionForProject,
  SESSION_PAGE_SIZE,
} from "./browser-state";
import { getErrorMessage } from "./bootstrap-state";
import type { ProviderSummary, SessionSummary } from "../api/types";
import { mergePreferredSession } from "./ui-preferences";

export async function refreshBrowserState(props: {
  loadBrowser?: typeof loadProviderBrowser;
  preferredSession?: SessionSummary | null;
  preferredSessionId?: string | null;
  project?: string | null;
  provider: ProviderSummary;
  setBrowser: Dispatch<SetStateAction<BrowserState>>;
  shouldAbort?: () => boolean;
}) {
  const {
    loadBrowser = loadProviderBrowser,
    preferredSession = null,
    preferredSessionId = null,
    project = null,
    provider,
    setBrowser,
    shouldAbort = () => false,
  } = props;
  setBrowser((current) => ({
    ...current,
    loading: true,
    loadingMore: false,
    error: null,
  }));
  try {
    const nextBrowser = await loadBrowser(
      provider,
      preferredSessionId,
      preferredSession,
      project,
    );
    if (shouldAbort()) {
      return;
    }
    setBrowser(nextBrowser);
  } catch (cause) {
    if (shouldAbort()) {
      return;
    }
    setBrowser((current) => ({
      ...current,
      loading: false,
      loadingMore: false,
      error: getErrorMessage(cause, "Failed to load provider"),
    }));
  }
}

export async function loadMoreBrowserSessions(props: {
  browser: BrowserState;
  loadPage?: typeof getProviderSessions;
  project: string | null;
  provider: ProviderSummary;
  setBrowser: Dispatch<SetStateAction<BrowserState>>;
  shouldAbort?: () => boolean;
}) {
  const {
    browser,
    loadPage = getProviderSessions,
    project,
    provider,
    setBrowser,
    shouldAbort = () => false,
  } = props;
  if (!browser.nextBefore || browser.loadingMore) {
    return;
  }

  setBrowser((current) => ({ ...current, loadingMore: true, error: null }));
  try {
    const page = await loadPage(
      provider.id,
      browser.nextBefore,
      SESSION_PAGE_SIZE,
      project,
    );
    if (shouldAbort()) {
      return;
    }
    setBrowser((current) => ({
      ...current,
      sessions: [...current.sessions, ...page.sessions],
      nextBefore: page.nextBefore,
      totalSessionCount:
        page.totalCount ?? current.totalSessionCount ?? current.sessions.length,
      loadingMore: false,
    }));
  } catch (cause) {
    if (shouldAbort()) {
      return;
    }
    setBrowser((current) => ({
      ...current,
      loadingMore: false,
      error: getErrorMessage(cause, "Failed to load more sessions"),
    }));
  }
}

export function shouldRefreshBrowserAfterSend(provider: ProviderSummary): boolean {
  return !provider.capabilities.stream;
}

export function createLoadingBrowserState(_current: BrowserState): BrowserState {
  return {
    ...INITIAL_BROWSER,
    loading: true,
  };
}

export function resolveInitBrowserSelection(props: {
  activeSession?: SessionSummary | null;
  preferredSession?: SessionSummary | null;
  preferredSessionId?: string | null;
  project?: string | null;
  sessions: SessionSummary[];
}) {
  const {
    activeSession = null,
    preferredSession = null,
    preferredSessionId = null,
    project = null,
    sessions,
  } = props;
  const preferredForProject =
    resolvePreferredSessionForProject(activeSession, project) ??
    resolvePreferredSessionForProject(preferredSession, project);
  const mergedSessions = mergePreferredSession(sessions, preferredForProject);
  return {
    selectedSessionId: resolveInitialSelectedSessionId(
      mergedSessions,
      preferredSessionId,
      preferredForProject,
    ),
    sessions: mergedSessions,
  };
}

export function applySentSessionSelection(
  current: BrowserState,
  sessionId: string,
  initialDisplay?: string | null,
): BrowserState {
  const sessionsWithoutDrafts = current.sessions.filter((session) => !session.isDraft);
  if (sessionsWithoutDrafts.some((session) => session.id === sessionId)) {
    return {
      ...current,
      sessions: sessionsWithoutDrafts,
      selectedSessionId: sessionId,
    };
  }

  const draftSession =
    current.sessions.find(
      (session) => session.id === current.selectedSessionId && session.isDraft,
    ) ?? current.sessions.find((session) => session.isDraft) ?? null;
  if (!draftSession) {
    return {
      ...current,
      sessions: sessionsWithoutDrafts,
      selectedSessionId: sessionId,
    };
  }

  const { isDraft: _isDraft, ...resolvedSession } = draftSession;
  return {
    ...current,
    sessions: [{
      ...resolvedSession,
      id: sessionId,
      display: initialDisplay?.trim() || resolvedSession.display,
    }, ...sessionsWithoutDrafts],
    selectedSessionId: sessionId,
  };
}
