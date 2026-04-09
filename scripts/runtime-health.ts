import { request } from "node:http";

export interface RuntimeHealthProbeResult {
  bootId: string | null;
  ok: boolean;
}

export async function probeHealth(
  url: string,
  origin: string,
  requestTimeoutMs: number,
): Promise<RuntimeHealthProbeResult> {
  return new Promise<RuntimeHealthProbeResult>((resolve) => {
    const pending = request(
      url,
      {
        agent: false,
        headers: {
          connection: "close",
          origin,
        },
        method: "GET",
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const ok = statusCode >= 200 && statusCode < 300;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        response.on("end", () => {
          resolve({
            ok,
            bootId: ok ? readBootId(Buffer.concat(chunks).toString("utf-8")) : null,
          });
        });
      },
    );

    pending.on("error", () => resolve({ ok: false, bootId: null }));
    pending.setTimeout(requestTimeoutMs, () => {
      pending.destroy();
      resolve({ ok: false, bootId: null });
    });
    pending.end();
  });
}

export async function waitForHealth(props: {
  endpoint: string;
  host: string;
  intervalMs: number;
  port: number;
  previousBootId?: string | null;
  requestTimeoutMs: number;
  timeoutMs: number;
}) {
  const {
    endpoint,
    host,
    intervalMs,
    port,
    previousBootId = null,
    requestTimeoutMs,
    timeoutMs,
  } = props;
  const url = `http://${host}:${port}${endpoint}`;
  const origin = `http://${host}:${port}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const health = await probeHealth(url, origin, requestTimeoutMs);
    if (health.ok && (!previousBootId || (health.bootId && health.bootId !== previousBootId))) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(`health check timed out for ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readBootId(payload: string): string | null {
  if (!payload.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(payload) as { bootId?: unknown };
    return typeof parsed.bootId === "string" && parsed.bootId.trim()
      ? parsed.bootId
      : null;
  } catch {
    return null;
  }
}
