import { request } from "node:http";

export async function probeHealth(url: string, origin: string, requestTimeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
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
        response.resume();
        const statusCode = response.statusCode ?? 0;
        resolve(statusCode >= 200 && statusCode < 300);
      },
    );

    pending.on("error", () => resolve(false));
    pending.setTimeout(requestTimeoutMs, () => {
      pending.destroy();
      resolve(false);
    });
    pending.end();
  });
}

export async function waitForHealth(props: {
  endpoint: string;
  host: string;
  intervalMs: number;
  port: number;
  requestTimeoutMs: number;
  timeoutMs: number;
}) {
  const { endpoint, host, intervalMs, port, requestTimeoutMs, timeoutMs } = props;
  const url = `http://${host}:${port}${endpoint}`;
  const origin = `http://${host}:${port}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await probeHealth(url, origin, requestTimeoutMs)) {
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
