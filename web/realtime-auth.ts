import { getAuthStatus, type AuthStatus } from "./api";

const authEvents = new EventTarget();
const AUTH_LOST_EVENT = "hub-run-auth-lost";
let pendingAuthProbe: Promise<boolean> | null = null;

export function notifyAuthLost(): void {
  authEvents.dispatchEvent(new Event(AUTH_LOST_EVENT));
}

export function subscribeAuthLost(listener: () => void): () => void {
  const handleEvent = () => {
    listener();
  };
  authEvents.addEventListener(AUTH_LOST_EVENT, handleEvent);
  return () => {
    authEvents.removeEventListener(AUTH_LOST_EVENT, handleEvent);
  };
}

export async function handleRealtimeStreamError(props: {
  isClosed: () => boolean;
  retryCount: number;
  getRetryDelay: (retryCount: number) => number;
  scheduleReconnect: (delay: number) => void;
  setReconnecting: () => void;
  readAuthStatus?: () => Promise<AuthStatus>;
}): Promise<boolean> {
  const {
    getRetryDelay,
    isClosed,
    readAuthStatus,
    retryCount,
    scheduleReconnect,
    setReconnecting,
  } = props;
  if (isClosed()) {
    return false;
  }

  if (await probeAuthLoss(readAuthStatus)) {
    if (!isClosed()) {
      authEvents.dispatchEvent(new Event(AUTH_LOST_EVENT));
    }
    return true;
  }

  if (isClosed()) {
    return false;
  }
  setReconnecting();
  scheduleReconnect(getRetryDelay(retryCount));
  return false;
}

async function probeAuthLoss(
  readAuthStatus: (() => Promise<AuthStatus>) | undefined,
): Promise<boolean> {
  if (!pendingAuthProbe) {
    pendingAuthProbe = (readAuthStatus ?? getAuthStatus)()
      .then((auth) => auth.authEnabled && !auth.authenticated)
      .catch(() => false)
      .finally(() => {
        pendingAuthProbe = null;
      });
  }
  return pendingAuthProbe;
}
