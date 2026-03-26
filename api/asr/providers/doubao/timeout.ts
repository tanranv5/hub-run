const DEFAULT_TIMEOUT_MESSAGE = "operation";

export function createTimeoutError(label: string): Error {
  return new Error(`${label} timed out`);
}

function mergeAbortSignal(
  signal: AbortSignal | null | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  if (!signal) {
    return timeoutSignal;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }

  const controller = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(source.reason);
    }
  };

  if (signal.aborted) {
    abortFrom(signal);
  } else {
    signal.addEventListener("abort", () => abortFrom(signal), { once: true });
  }
  if (timeoutSignal.aborted) {
    abortFrom(timeoutSignal);
  } else {
    timeoutSignal.addEventListener(
      "abort",
      () => abortFrom(timeoutSignal),
      { once: true },
    );
  }
  return controller.signal;
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label = DEFAULT_TIMEOUT_MESSAGE,
): Promise<T> {
  if (timeoutMs <= 0) {
    return operation;
  }

  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError(label));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const request = fetchImpl(input, {
    ...init,
    signal: mergeAbortSignal(init.signal, controller.signal),
  });

  try {
    return await withTimeout(request, timeoutMs, label);
  } catch (error) {
    controller.abort();
    throw error;
  }
}
