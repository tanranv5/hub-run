import { getRuntimeHealth, restartHubRuntime } from "./api";

const DEFAULT_RUNTIME_HEALTH_INTERVAL_MS = 250;
const DEFAULT_RUNTIME_HEALTH_TIMEOUT_MS = 15_000;
const DEFAULT_RUNTIME_HEALTH_INITIAL_DELAY_MS = 500;

export async function waitForRuntimeHealth(props: {
  delay?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  initialDelayMs?: number;
  intervalMs?: number;
  previousBootId?: string | null;
  timeoutMs?: number;
} = {}): Promise<void> {
  const {
    delay = wait,
    fetchImpl = fetch,
    initialDelayMs = DEFAULT_RUNTIME_HEALTH_INITIAL_DELAY_MS,
    intervalMs = DEFAULT_RUNTIME_HEALTH_INTERVAL_MS,
    previousBootId = null,
    timeoutMs = DEFAULT_RUNTIME_HEALTH_TIMEOUT_MS,
  } = props;

  // Wait for the restart script to actually begin the launchctl kickstart
  await delay(initialDelayMs);

  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const response = await fetchImpl("/api/health", {
        cache: "no-store",
        credentials: "include",
      });
      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { bootId?: string | null }
          | null;
        const nextBootId =
          typeof payload?.bootId === "string" ? payload.bootId : null;
        if (!previousBootId || (nextBootId && nextBootId !== previousBootId)) {
          return;
        }
      }
    } catch {
      // runtime is still restarting — keep polling until timeout
    }
    await delay(intervalMs);
  }

  throw new Error("运行时重启超时，请刷新页面重试");
}

export async function restartRuntimeAndRefresh(props: {
  refresh: () => Promise<void>;
  readRuntimeHealth?: typeof getRuntimeHealth;
  restartRuntime?: typeof restartHubRuntime;
  waitForHealth?: typeof waitForRuntimeHealth;
}) {
  const {
    refresh,
    readRuntimeHealth = getRuntimeHealth,
    restartRuntime = restartHubRuntime,
    waitForHealth = waitForRuntimeHealth,
  } = props;
  const initialHealth = await readRuntimeHealth().catch(() => ({
    ok: false,
    bootId: null,
  }));
  const restart = await restartRuntime();
  await waitForHealth({
    previousBootId: restart.bootId ?? initialHealth.bootId,
  });
  await refresh();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
