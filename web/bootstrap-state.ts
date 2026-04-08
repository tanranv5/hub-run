import type { Dispatch, SetStateAction } from "react";
import type { ProviderSummary } from "../api/types";
import {
  getAuthStatus,
  getProviders,
  loginWithPassword,
  logout,
  type AuthStatus,
} from "./api";
import { findDefaultProvider } from "./browser-state";
import { getErrorMessage } from "./utils";

export interface BootstrapState {
  auth: AuthStatus | null;
  providers: ProviderSummary[];
  selectedProviderId: string | null;
  busy: boolean;
  loading: boolean;
  error: string | null;
}

export const INITIAL_BOOTSTRAP: BootstrapState = {
  auth: null,
  providers: [],
  selectedProviderId: null,
  busy: false,
  loading: true,
  error: null,
};

export { getErrorMessage } from "./utils";

export async function bootstrapApp(
  setBootstrap: Dispatch<SetStateAction<BootstrapState>>,
) {
  setBootstrap((current) => ({ ...current, loading: true, error: null }));
  try {
    const [auth, providers] = await Promise.all([
      getAuthStatus(),
      getProviders().catch(() => [] as ProviderSummary[]),
    ]);
    if (auth.authEnabled && !auth.authenticated) {
      setBootstrap((current) => ({
        ...current,
        auth,
        providers: [],
        selectedProviderId: null,
        loading: false,
      }));
      return;
    }

    setBootstrap((current) => ({
      ...current,
      auth,
      providers,
      selectedProviderId:
        current.selectedProviderId &&
        providers.some((p) => p.id === current.selectedProviderId)
          ? current.selectedProviderId
          : findDefaultProvider(providers),
      loading: false,
    }));
  } catch (cause) {
    setBootstrap((current) => ({
      ...current,
      loading: false,
      error: getErrorMessage(cause, "Bootstrap failed"),
    }));
  }
}

export async function reloadProviders(
  setBootstrap: Dispatch<SetStateAction<BootstrapState>>,
) {
  try {
    await refreshProviders(setBootstrap);
  } catch (cause) {
    setBootstrap((current) => ({
      ...current,
      error: getErrorMessage(cause, "Failed to refresh providers"),
    }));
  }
}

export async function handleLogin(
  password: string,
  setBootstrap: Dispatch<SetStateAction<BootstrapState>>,
) {
  setBootstrap((current) => ({ ...current, busy: true, error: null }));
  try {
    await loginWithPassword(password);
    await bootstrapApp(setBootstrap);
  } catch (cause) {
    setBootstrap((current) => ({
      ...current,
      error: getErrorMessage(cause, "Login failed"),
    }));
  } finally {
    setBootstrap((current) => ({ ...current, busy: false }));
  }
}

export async function handleLogout(
  setBootstrap: Dispatch<SetStateAction<BootstrapState>>,
) {
  setBootstrap((current) => ({ ...current, busy: true, error: null }));
  try {
    await logout();
    await bootstrapApp(setBootstrap);
  } catch (cause) {
    setBootstrap((current) => ({
      ...current,
      error: getErrorMessage(cause, "Logout failed"),
    }));
  } finally {
    setBootstrap((current) => ({ ...current, busy: false }));
  }
}

async function refreshProviders(
  setBootstrap: Dispatch<SetStateAction<BootstrapState>>,
) {
  const nextProviders = await getProviders();
  setBootstrap((current) => ({
    ...current,
    providers: nextProviders,
    selectedProviderId:
      current.selectedProviderId &&
      nextProviders.some((provider) => provider.id === current.selectedProviderId)
        ? current.selectedProviderId
        : findDefaultProvider(nextProviders),
  }));
}
