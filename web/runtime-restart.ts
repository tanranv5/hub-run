import { restartHubRuntime } from "./api";

const DEFAULT_RUNTIME_HEALTH_INTERVAL_MS = 250;
const DEFAULT_RUNTIME_HEALTH_TIMEOUT_MS = 15_000;
const DEFAULT_RUNTIME_HEALTH_INITIAL_DELAY_MS = 500;

export async function waitForRuntimeHealth(props: {
  delay?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  initialDelayMs?: number;
  intervalMs?: number;
  timeoutMs?: number;
} = {}): Promise<void> {
  const {
    delay = wait,
    fetchImpl = fetch,
    initialDelayMs = DEFAULT_RUNTIME_HEALTH_INITIAL_DELAY_MS,
    intervalMs = DEFAULT_RUNTIME_HEALTH_INTERVAL_MS,
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
        return;
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
  restartRuntime?: typeof restartHubRuntime;
  waitForHealth?: typeof waitForRuntimeHealth;
}) {
  const {
    refresh,
    restartRuntime = restartHubRuntime,
    waitForHealth = waitForRuntimeHealth,
  } = props;
  await restartRuntime();
  await waitForHealth();
  await refresh();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
