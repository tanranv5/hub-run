import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderSummary } from "../api/types";
import { createProviderSession, deleteProviderSession, sendConversationMessage } from "./api";
import { clearStoredSelectedSession, getStoredControlPreference, getStoredSelectedSession, persistProviderControls, persistSelectedSession, resolveContextDrivenControls, resolveUserSelectedControls } from "./app-preferences";
import { INITIAL_BROWSER, loadProviderBrowser } from "./browser-state";
import {
  applySentSessionSelection,
  createLoadingBrowserState,
  loadMoreBrowserSessions,
  refreshBrowserState,
  shouldRefreshBrowserAfterSend,
} from "./app-browser-actions";
import {
  bootstrapApp,
  getErrorMessage,
  handleLogin,
  handleLogout,
  INITIAL_BOOTSTRAP,
} from "./bootstrap-state";
import AppScreen from "./components/app-screen";
import { LoadingScreen } from "./components/app-shell";
import type { SendConversationResult } from "./conversation-panel-state-types";
import LoginScreen from "./components/login-screen";
import { formatContextDetails, formatContextLabel, useProviderSessionContext } from "./session-context";
import {
  createLoadingProviderControls,
  getEffortOptions,
  INITIAL_PROVIDER_CONTROLS,
  loadProviderControls,
} from "./provider-controls";
import { createDraftSession, insertDraftSession, isDraftSession } from "./draft-session";
import { preloadSessionPanelCache } from "./conversation-panel-preload";
import type { SessionPanelCacheEntry } from "./conversation-panel-session-cache";
import { subscribeAuthLost } from "./realtime-auth";
import { useProviderSessionsStream } from "./use-provider-sessions-stream";
import { refreshAppData } from "./app-refresh";

export default function App() {
  const [bootstrap, setBootstrap] = useState(INITIAL_BOOTSTRAP);
  const [browser, setBrowser] = useState(INITIAL_BROWSER);
  const [controls, setControls] = useState(INITIAL_PROVIDER_CONTROLS);
  const [providerSwitchTargetId, setProviderSwitchTargetId] = useState<string | null>(null);
  const [panelRefreshVersion, setPanelRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const browserRequestVersionRef = useRef(0);
  const sessionCacheRef = useRef<Map<string, SessionPanelCacheEntry>>(new Map());

  useEffect(() => {
    bootstrapApp(setBootstrap).catch(console.error);
  }, []);

  useEffect(() => {
    return subscribeAuthLost(() => {
      bootstrapApp(setBootstrap).catch(console.error);
    });
  }, []);

  const selectedProvider = useMemo(() => bootstrap.providers.find((provider) => provider.id === bootstrap.selectedProviderId) ?? null, [bootstrap.providers, bootstrap.selectedProviderId]);
  const providerSwitchLabel = useMemo(
    () => bootstrap.providers.find((provider) => provider.id === providerSwitchTargetId)?.label ?? null,
    [bootstrap.providers, providerSwitchTargetId],
  );

  async function loadBrowserWithPreloadedSelection(
    provider: ProviderSummary,
    preferredSessionId: string | null,
    preferredSession: ReturnType<typeof getStoredSelectedSession>,
    project: string | null,
  ) {
    const nextBrowser = await loadProviderBrowser(
      provider,
      preferredSessionId,
      preferredSession,
      project,
    );
    const nextSession =
      nextBrowser.sessions.find(
        (session) => session.id === nextBrowser.selectedSessionId,
      ) ?? null;
    if (nextSession) {
      await preloadSessionPanelCache({
        cache: sessionCacheRef.current,
        providerId: provider.id,
        session: nextSession,
      });
    }
    return nextBrowser;
  }

  useEffect(() => {
    browserRequestVersionRef.current += 1;
  }, [controls.selectedProject, selectedProvider?.id]);

  useEffect(() => {
    if (!selectedProvider) {
      setBrowser(INITIAL_BROWSER);
      setControls(INITIAL_PROVIDER_CONTROLS);
      return;
    }

    let cancelled = false;
    setControls((current) => ({ ...current, loading: true, error: null }));
    loadProviderControls(selectedProvider, getStoredControlPreference(selectedProvider.id))
      .then((nextControls) => {
        if (!cancelled) {
          setControls(nextControls);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setControls((current) => ({
            ...current,
            loading: false,
            error: getErrorMessage(cause, "Failed to load provider controls"),
          }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProvider]);

  useEffect(() => {
    if (!selectedProvider) {
      setBrowser(INITIAL_BROWSER);
      return;
    }
    let cancelled = false;
    const preferredSession = getStoredSelectedSession(
      selectedProvider.id,
      controls.selectedProject,
    );
    refreshBrowserState({
      loadBrowser: loadBrowserWithPreloadedSelection,
      preferredSession,
      preferredSessionId: preferredSession?.id ?? null,
      provider: selectedProvider,
      project: controls.selectedProject,
      shouldAbort: () => cancelled,
      setBrowser,
    }).catch((cause) => {
      if (!cancelled) {
        console.error(cause);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [controls.selectedProject, selectedProvider]);

  const selectedSession = useMemo(() => browser.sessions.find((session) => session.id === browser.selectedSessionId) ?? null, [browser.selectedSessionId, browser.sessions]);
  const sessionContext = useProviderSessionContext({
    providerId: selectedProvider?.id ?? null,
    refreshVersion: panelRefreshVersion,
    sessionId: selectedSession?.id ?? null,
    sessionTimestamp: selectedSession?.timestamp ?? null,
  });
  useProviderSessionsStream({
    browser,
    project: controls.selectedProject,
    provider: selectedProvider,
    setBrowser,
  });
  const effortOptions = useMemo(() => getEffortOptions(controls.models, controls.selectedModelId, controls.selectedEffort), [controls.models, controls.selectedEffort, controls.selectedModelId]);
  const contextLabel = formatContextLabel(sessionContext);
  const contextDetails = formatContextDetails(sessionContext);

  useEffect(() => {
    if (!selectedProvider || !selectedSession || isDraftSession(selectedSession)) {
      return;
    }
    persistSelectedSession(selectedProvider.id, controls.selectedProject, selectedSession);
  }, [controls.selectedProject, selectedProvider, selectedSession]);

  useEffect(() => {
    if (!controls.models.length) {
      return;
    }
    setControls((current) => ({ ...current, ...resolveContextDrivenControls(current.models, current.selectedModelId, current.selectedEffort, sessionContext) }));
  }, [controls.models.length, sessionContext]);

  useEffect(() => {
    if (!providerSwitchTargetId) {
      return;
    }
    if (selectedProvider?.id !== providerSwitchTargetId) {
      return;
    }
    if (controls.loading || browser.loading) {
      return;
    }
    setProviderSwitchTargetId(null);
  }, [browser.loading, controls.loading, providerSwitchTargetId, selectedProvider?.id]);

  const providerModelPayload = useMemo(() => {
    if (!selectedProvider?.capabilities.modelSelection) return {};
    return {
      ...(controls.selectedModelId ? { model: controls.selectedModelId } : {}),
      ...(controls.selectedEffort ? { effort: controls.selectedEffort } : {}),
    };
  }, [selectedProvider, controls.selectedModelId, controls.selectedEffort]);

  async function handleCreateSession() {
    if (!selectedProvider) {
      return;
    }

    const cwd = controls.newSessionCwd.trim() || selectedSession?.project || "";
    if (!cwd) {
      setControls((current) => ({ ...current, error: "项目路径不能为空" }));
      return;
    }

    setControls((current) => ({ ...current, creatingSession: true, error: null }));
    try {
      if (!selectedProvider.capabilities.emptyCreateSession) {
        const draftSession = createDraftSession(cwd);
        setBrowser((current) => ({ ...current, error: null, loading: false, loadingMore: false, sessions: insertDraftSession(current.sessions, draftSession), selectedSessionId: draftSession.id }));
        setControls((current) => ({ ...current, creatingSession: false, newSessionCwd: cwd }));
        return;
      }

      const created = await createProviderSession(selectedProvider.id, {
        cwd,
        ...providerModelPayload,
      });
      setControls((current) => ({ ...current, creatingSession: false, newSessionCwd: cwd }));
      const requestVersion = browserRequestVersionRef.current;
      await refreshBrowserState({
        loadBrowser: loadBrowserWithPreloadedSelection,
        preferredSessionId: created.sessionId,
        project: controls.selectedProject,
        provider: selectedProvider,
        setBrowser,
        shouldAbort: () => requestVersion !== browserRequestVersionRef.current,
      });
    } catch (cause) {
      setControls((current) => ({ ...current, creatingSession: false, error: getErrorMessage(cause, "Failed to create session") }));
    }
  }

  async function handleSendMessage(text: string): Promise<SendConversationResult> {
    if (!selectedProvider || !selectedSession) {
      throw new Error("provider or session is missing");
    }
    const input = {
      text,
      ...providerModelPayload,
    };

    if (isDraftSession(selectedSession)) {
      const cwd = selectedSession.project.trim() || controls.newSessionCwd.trim();
      if (!cwd) {
        throw new Error("项目路径不能为空");
      }
      const created = await createProviderSession(selectedProvider.id, {
        cwd,
        text,
        ...providerModelPayload,
      });
      return {
        sessionId: created.sessionId,
        turnId: created.turnId,
        outputText: created.outputText ?? null,
      };
    }

    const sent = await sendConversationMessage(selectedProvider.id, selectedSession.id, { ...input });
    return {
      sessionId: selectedSession.id,
      turnId: sent.turnId,
      outputText: sent.outputText,
    };
  }

  async function handleSelectSession(sessionId: string) {
    // Switch immediately to avoid UI lag
    setBrowser((current) => ({ ...current, selectedSessionId: sessionId }));
    setSidebarOpen(false);

    // Preload in background — non-blocking
    if (selectedProvider) {
      const nextSession =
        browser.sessions.find((session) => session.id === sessionId) ?? null;
      if (nextSession) {
        preloadSessionPanelCache({
          cache: sessionCacheRef.current,
          providerId: selectedProvider.id,
          session: nextSession,
        }).catch(() => {
          // Preload failure is non-critical; bootstrap will load data anyway
        });
      }
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!selectedProvider) return;
    try {
      await deleteProviderSession(selectedProvider.id, sessionId);
      clearStoredSelectedSession(selectedProvider.id, sessionId);
      setBrowser((current) => ({
        ...current,
        sessions: current.sessions.filter((s) => s.id !== sessionId),
        deletedSessionIds: new Set([...current.deletedSessionIds, sessionId]),
        selectedSessionId:
          current.selectedSessionId === sessionId ? null : current.selectedSessionId,
      }));
    } catch (cause) {
      console.error("Failed to delete session:", cause);
      throw cause;
    }
  }

  function handleSelectEffort(value: typeof controls.selectedEffort) {
    if (!selectedProvider) {
      return;
    }
    setControls((current) => {
      const nextControls = { ...current, selectedEffort: value };
      persistProviderControls(selectedProvider.id, nextControls.selectedModelId, nextControls.selectedEffort);
      return nextControls;
    });
  }

  function handleSelectModel(value: string | null) {
    if (!selectedProvider) {
      return;
    }
    setControls((current) => {
      const nextSelection = resolveUserSelectedControls(current.models, value, current.selectedEffort);
      persistProviderControls(selectedProvider.id, nextSelection.selectedModelId, nextSelection.selectedEffort);
      return { ...current, ...nextSelection };
    });
  }

  function handleSelectProvider(providerId: string) {
    if (providerId === bootstrap.selectedProviderId) {
      return;
    }
    const nextProvider = bootstrap.providers.find((provider) => provider.id === providerId);
    if (!nextProvider) {
      return;
    }

    setProviderSwitchTargetId(nextProvider.id);
    setControls(() => createLoadingProviderControls());
    setBrowser((current) => createLoadingBrowserState(current));
    setBootstrap((current) => ({ ...current, selectedProviderId: providerId }));
  }

  async function handleRefresh() {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    try {
      await refreshAppData({
        bumpRefreshVersion: () => {
          setPanelRefreshVersion((value) => value + 1);
        },
        reloadConversation: async () => {
          if (!selectedProvider || !selectedSession || isDraftSession(selectedSession)) {
            return;
          }
          await preloadSessionPanelCache({
            cache: sessionCacheRef.current,
            providerId: selectedProvider.id,
            session: selectedSession,
          });
        },
      });
    } catch (cause) {
      console.error(cause);
    } finally {
      setRefreshing(false);
    }
  }

  if (bootstrap.loading) {
    return <LoadingScreen />;
  }

  if (bootstrap.auth?.authEnabled && !bootstrap.auth.authenticated) {
    return (
      <LoginScreen
        busy={bootstrap.busy}
        error={bootstrap.error}
        onSubmit={(password) => handleLogin(password, setBootstrap)}
      />
    );
  }

  return (
    <AppScreen
      authEnabled={Boolean(bootstrap.auth?.authEnabled)}
      bootstrapError={bootstrap.error}
      blockingOverlayLabel={
        providerSwitchTargetId
          ? `正在切换到 ${providerSwitchLabel ?? "Provider"}...`
          : null
      }
      browser={browser}
      contextDetails={contextDetails}
      contextLabel={contextLabel}
      controls={controls}
      desktopSidebarOpen={desktopSidebarOpen}
      effortOptions={effortOptions}
      refreshing={refreshing}
      onCreateSession={() => {
        handleCreateSession().catch(console.error);
      }}
      onCloseSidebar={() => setSidebarOpen(false)}
      onLoadMore={() => {
        if (!selectedProvider) {
          return;
        }
        const requestVersion = browserRequestVersionRef.current;
        loadMoreBrowserSessions({
          browser,
          project: controls.selectedProject,
          provider: selectedProvider,
          setBrowser,
          shouldAbort: () => requestVersion !== browserRequestVersionRef.current,
        }).catch(console.error);
      }}
      onLogout={() => handleLogout(setBootstrap)}
      onMessageSent={async (sessionId, initialDisplay) => {
        const requestVersion = browserRequestVersionRef.current;
        setBrowser((current) => {
          // Only switch if still on the originating session or a draft being resolved
          const currentIsDraft = current.sessions.some(
            (s) => s.id === current.selectedSessionId && s.isDraft,
          );
          if (current.selectedSessionId !== sessionId && !currentIsDraft) {
            // User has switched away — don't snap back
            return current;
          }
          return applySentSessionSelection(current, sessionId, initialDisplay);
        });
        if (!selectedProvider) {
          return;
        }
        if (!shouldRefreshBrowserAfterSend(selectedProvider)) {
          return;
        }
        await refreshBrowserState({
          preferredSessionId: sessionId,
          project: controls.selectedProject,
          provider: selectedProvider,
          setBrowser,
          shouldAbort: () => requestVersion !== browserRequestVersionRef.current,
        });
      }}
      onNewSessionCwdChange={(value) => setControls((current) => ({ ...current, newSessionCwd: value }))}
      onOpenBrowser={() => setSidebarOpen(true)}
      onRefresh={() => {
        void handleRefresh();
      }}
      onSelectEffort={handleSelectEffort}
      onSelectModel={handleSelectModel}
      onSelectProject={(value) => setControls((current) => ({ ...current, selectedProject: value }))}
      onSelectProvider={handleSelectProvider}
      onSelectSession={(sessionId) => {
        handleSelectSession(sessionId).catch(console.error);
      }}
      onDeleteSession={handleDeleteSession}
      onToggleDesktopSidebar={() => setDesktopSidebarOpen((value) => !value)}
      panelRefreshVersion={panelRefreshVersion}
      provider={selectedProvider}
      providers={bootstrap.providers}
      sessionCacheRef={sessionCacheRef}
      selectedSession={selectedSession}
      sendMessage={handleSendMessage}
      sidebarOpen={sidebarOpen}
    />
  );
}
