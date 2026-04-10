import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderSummary, SendMessageInput } from "../api/types";
import { createProviderSession, deleteProviderSession, getProviderInit, sendConversationMessage } from "./api";
import {
  assignCreateSessionBlockingSessionId,
  CREATE_SESSION_BLOCKING_TIMEOUT_MS,
  createPendingCreateSessionBlockingTarget,
  resolveAppBlockingOverlay,
  shouldReleaseCreateSessionBlocking,
  type ConversationStreamBinding,
  type CreateSessionBlockingTarget,
} from "./app-blocking-overlay";
import { clearStoredSelectedSession, getStoredControlPreference, getStoredSelectedSession, persistProviderControls, persistSelectedSession, resolveContextDrivenControls, resolveUserSelectedControls } from "./app-preferences";
import { INITIAL_BROWSER, loadProviderBrowser, SESSION_PAGE_SIZE, resolvePreferredSessionForProject, resolveInitialSelectedSessionId } from "./browser-state";
import type { BrowserState } from "./browser-state";
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
  resolveProviderControlsFromData,
} from "./provider-controls";
import { createDraftSession, insertDraftSession, isDraftSession } from "./draft-session";
import { preloadSessionPanelCache } from "./conversation-panel-preload";
import type { SessionPanelCacheEntry } from "./conversation-panel-session-cache";
import { subscribeAuthLost } from "./realtime-auth";
import { createIdleRealtimeStreamStatus } from "./realtime-stream-status";
import { restartRuntimeAndRefresh } from "./runtime-restart";
import { useProviderSessionsStream } from "./use-provider-sessions-stream";
import { mergePreferredSession } from "./ui-preferences";
import { refreshAppData } from "./app-refresh";

export default function App() {
  const [bootstrap, setBootstrap] = useState(INITIAL_BOOTSTRAP);
  const [browser, setBrowser] = useState(INITIAL_BROWSER);
  const [controls, setControls] = useState(INITIAL_PROVIDER_CONTROLS);
  const [providerSwitchTargetId, setProviderSwitchTargetId] = useState<string | null>(null);
  const [panelRefreshVersion, setPanelRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [runtimeRestarting, setRuntimeRestarting] = useState(false);
  const [createSessionBlockingTarget, setCreateSessionBlockingTarget] =
    useState<CreateSessionBlockingTarget | null>(null);
  const [conversationStreamBinding, setConversationStreamBinding] =
    useState<ConversationStreamBinding | null>(null);
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
    setBrowser((current) => ({
      ...current,
      loading: true,
      loadingMore: false,
      error: null,
    }));

    const preferredSession = getStoredSelectedSession(
      selectedProvider.id,
      controls.selectedProject,
    );

    getProviderInit(
      selectedProvider.id,
      SESSION_PAGE_SIZE,
      controls.selectedProject,
    )
      .then(async (init) => {
        if (cancelled) return;

        const nextControls = resolveProviderControlsFromData(
          init.projects,
          init.models,
          getStoredControlPreference(selectedProvider.id),
          {
            newSessionCwd: controls.newSessionCwd,
            selectedProject: controls.selectedProject,
          },
        );
        setControls(nextControls);

        const sessions = mergePreferredSession(init.sessions.sessions, resolvePreferredSessionForProject(preferredSession, controls.selectedProject));
        const selectedSessionId = resolveInitialSelectedSessionId(
          sessions,
          preferredSession?.id ?? null,
          resolvePreferredSessionForProject(preferredSession, controls.selectedProject),
        );
        const nextBrowser: BrowserState = {
          sessions,
          deletedSessionIds: new Set(),
          nextBefore: init.sessions.nextBefore,
          totalSessionCount: init.sessions.totalCount ?? sessions.length,
          selectedSessionId,
          streamStatus: createIdleRealtimeStreamStatus(),
          loading: false,
          loadingMore: false,
          error: null,
        };

        const nextSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
        if (nextSession) {
          await preloadSessionPanelCache({
            cache: sessionCacheRef.current,
            providerId: selectedProvider.id,
            session: nextSession,
          });
        }

        if (!cancelled) {
          setBrowser(nextBrowser);
        }
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = getErrorMessage(cause, "Failed to initialize provider");
        setControls((current) => ({ ...current, loading: false, error: message }));
        setBrowser((current) => ({ ...current, loading: false, error: message }));
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

  useEffect(() => {
    if (
      !shouldReleaseCreateSessionBlocking({
        conversationStream: conversationStreamBinding,
        selectedProviderId: selectedProvider?.id ?? null,
        selectedSessionId: selectedSession?.id ?? null,
        target: createSessionBlockingTarget,
      })
    ) {
      return;
    }
    setCreateSessionBlockingTarget(null);
  }, [
    conversationStreamBinding,
    createSessionBlockingTarget,
    selectedProvider?.id,
    selectedSession?.id,
  ]);

  useEffect(() => {
    if (!createSessionBlockingTarget) {
      return;
    }

    const elapsedMs = Date.now() - createSessionBlockingTarget.startedAt;
    const remainingMs = Math.max(
      0,
      CREATE_SESSION_BLOCKING_TIMEOUT_MS - elapsedMs,
    );
    if (remainingMs === 0) {
      setCreateSessionBlockingTarget(null);
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setCreateSessionBlockingTarget((current) =>
        current?.startedAt === createSessionBlockingTarget.startedAt
          ? null
          : current,
      );
    }, remainingMs);
    return () => globalThis.clearTimeout(timeoutId);
  }, [createSessionBlockingTarget]);

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

    const blockingTarget =
      selectedProvider.capabilities.stream && selectedProvider.capabilities.emptyCreateSession
        ? createPendingCreateSessionBlockingTarget(selectedProvider.id)
        : null;
    if (blockingTarget) {
      setCreateSessionBlockingTarget(blockingTarget);
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
      if (blockingTarget) {
        setCreateSessionBlockingTarget(
          assignCreateSessionBlockingSessionId(blockingTarget, created.sessionId),
        );
      }
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
      setCreateSessionBlockingTarget(null);
      setControls((current) => ({ ...current, creatingSession: false, error: getErrorMessage(cause, "Failed to create session") }));
    }
  }

  async function handleSendMessage(input: SendMessageInput): Promise<SendConversationResult> {
    if (!selectedProvider || !selectedSession) {
      throw new Error("provider or session is missing");
    }
    const payload = {
      ...input,
      ...providerModelPayload,
    };

    if (isDraftSession(selectedSession)) {
      const cwd = selectedSession.project.trim() || controls.newSessionCwd.trim();
      if (!cwd) {
        throw new Error("项目路径不能为空");
      }
      const created = await createProviderSession(selectedProvider.id, {
        cwd,
        ...payload,
      });
      return {
        sessionId: created.sessionId,
        turnId: created.turnId,
        outputText: created.outputText ?? null,
      };
    }

    const sent = await sendConversationMessage(selectedProvider.id, selectedSession.id, payload);
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
        reloadConversation: reloadSelectedConversation,
      });
    } catch (cause) {
      console.error(cause);
    } finally {
      setRefreshing(false);
    }
  }

  async function reloadSelectedConversation() {
    if (!selectedProvider || !selectedSession || isDraftSession(selectedSession)) {
      return;
    }
    await preloadSessionPanelCache({
      cache: sessionCacheRef.current,
      providerId: selectedProvider.id,
      session: selectedSession,
    });
  }

  async function reloadSelectedBrowser() {
    if (!selectedProvider) {
      return;
    }
    const requestVersion = browserRequestVersionRef.current;
    await refreshBrowserState({
      loadBrowser: loadBrowserWithPreloadedSelection,
      preferredSessionId: selectedSession?.id ?? null,
      project: controls.selectedProject,
      provider: selectedProvider,
      setBrowser,
      shouldAbort: () => requestVersion !== browserRequestVersionRef.current,
    });
  }

  async function handleRestartRuntime() {
    if (runtimeRestarting) {
      return;
    }

    setRuntimeRestarting(true);
    try {
      await restartRuntimeAndRefresh({
        refresh: async () => {
          await refreshAppData({
            bumpRefreshVersion: () => {
              setPanelRefreshVersion((value) => value + 1);
            },
            reloadConversation: reloadSelectedConversation,
            reloadProviders: reloadSelectedBrowser,
          });
        },
      });
    } catch (cause) {
      console.error(cause);
    } finally {
      setRuntimeRestarting(false);
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

  const blockingOverlay = resolveAppBlockingOverlay({
    createSessionTarget: createSessionBlockingTarget,
    providerSwitchLabel: providerSwitchTargetId
      ? (providerSwitchLabel ?? "Provider")
      : null,
    runtimeRestarting,
  });

  return (
    <AppScreen
      authEnabled={Boolean(bootstrap.auth?.authEnabled)}
      blockingOverlayDescription={blockingOverlay?.description ?? null}
      bootstrapError={bootstrap.error}
      blockingOverlayLabel={blockingOverlay?.label ?? null}
      browser={browser}
      contextDetails={contextDetails}
      contextLabel={contextLabel}
      controls={controls}
      desktopSidebarOpen={desktopSidebarOpen}
      effortOptions={effortOptions}
      refreshing={refreshing || runtimeRestarting}
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
        if (
          selectedProvider?.capabilities.stream &&
          selectedSession?.isDraft &&
          sessionId !== selectedSession.id
        ) {
          setCreateSessionBlockingTarget({
            providerId: selectedProvider.id,
            sessionId,
            startedAt: Date.now(),
          });
        }
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
      onConversationStreamStatusChange={setConversationStreamBinding}
      onNewSessionCwdChange={(value) => setControls((current) => ({ ...current, newSessionCwd: value }))}
      onOpenBrowser={() => setSidebarOpen(true)}
      onRefresh={() => {
        void handleRefresh();
      }}
      onRestartRuntime={handleRestartRuntime}
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
      restartingRuntime={runtimeRestarting}
      sessionCacheRef={sessionCacheRef}
      selectedSession={selectedSession}
      sendMessage={handleSendMessage}
      sidebarOpen={sidebarOpen}
    />
  );
}
