import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { AsrServiceError } from "../asr/errors";
import { isTerminalEvent } from "../asr/service-helpers";
import { rejectInvalidWriteOrigin } from "../auth";
import type { RuntimeConfig } from "../config";
import type {
  AsrAudioEncoding,
  AsrService,
  AsrSessionEvent,
  AsrSessionStartInput,
} from "../asr/types";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_SLICE_MS = 1_000;
const DEFAULT_AFTER_EVENT_ID = 0;

function jsonError(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json({ error: { code, message } }, { status });
}

function parseEncoding(value: unknown): AsrAudioEncoding | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const encoding = value.trim();
  return encoding ? encoding : undefined;
}

function parseOptionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function parseAfterEventId(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_AFTER_EVENT_ID;
  }
  return parsed;
}

function parseCreateBody(value: unknown): AsrSessionStartInput {
  if (!value || typeof value !== "object") {
    throw new AsrServiceError(
      "ASR_INVALID_REQUEST",
      "providerId is required",
      400,
    );
  }

  const body = value as Record<string, unknown>;
  const providerId =
    typeof body.providerId === "string" ? body.providerId.trim() : "";
  if (!providerId) {
    throw new AsrServiceError(
      "ASR_INVALID_REQUEST",
      "providerId is required",
      400,
    );
  }

  const sampleRate = parseOptionalPositiveInteger(body.sampleRate);
  if (body.sampleRate !== undefined && sampleRate === undefined) {
    throw new AsrServiceError(
      "ASR_INVALID_REQUEST",
      "sampleRate must be a positive integer",
      400,
    );
  }

  const channels = parseOptionalPositiveInteger(body.channels);
  if (body.channels !== undefined && channels === undefined) {
    throw new AsrServiceError(
      "ASR_INVALID_REQUEST",
      "channels must be a positive integer",
      400,
    );
  }

  const encoding = parseEncoding(body.encoding);
  if (body.encoding !== undefined && encoding === undefined) {
    throw new AsrServiceError(
      "ASR_INVALID_REQUEST",
      "encoding is invalid",
      400,
    );
  }

  return {
    providerId,
    ...(sampleRate !== undefined ? { sampleRate } : {}),
    ...(channels !== undefined ? { channels } : {}),
    ...(encoding !== undefined ? { encoding } : {}),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runHeartbeat(
  stream: {
    writeSSE: (payload: { event: string; data: string }) => Promise<void>;
  },
  cleanup: {
    isClosed: () => boolean;
    waitClosed: () => Promise<void>;
  },
) {
  while (!cleanup.isClosed()) {
    await stream.writeSSE({
      event: "heartbeat",
      data: JSON.stringify({ timestamp: Date.now() }),
    });
    let remaining = HEARTBEAT_INTERVAL_MS;
    while (remaining > 0 && !cleanup.isClosed()) {
      const slice = Math.min(HEARTBEAT_SLICE_MS, remaining);
      await Promise.race([sleep(slice), cleanup.waitClosed()]);
      remaining -= slice;
    }
  }
}

function createCleanup(onClose: () => void) {
  let closed = false;
  let resolveClosed: (() => void) | null = null;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  return {
    close() {
      if (closed) {
        return;
      }
      closed = true;
      onClose();
      resolveClosed?.();
    },
    isClosed() {
      return closed;
    },
    waitClosed() {
      return closedPromise;
    },
  };
}

async function writeEvent(
  stream: {
    writeSSE: (payload: { event: string; data: string }) => Promise<void>;
  },
  event: AsrSessionEvent,
) {
  await stream.writeSSE({
    event: "asr",
    data: JSON.stringify(event),
  });
}

async function writeTerminalAwareEvent(
  stream: {
    writeSSE: (payload: { event: string; data: string }) => Promise<void>;
  },
  event: AsrSessionEvent,
): Promise<boolean> {
  await writeEvent(stream, event);
  return isTerminalEvent(event);
}

function handleAsrError(error: unknown): Response {
  if (error instanceof AsrServiceError) {
    return jsonError(error.code, error.message, error.status);
  }
  const message =
    error instanceof Error ? error.message : "Unexpected ASR error";
  return jsonError("ASR_INTERNAL_ERROR", message, 500);
}

export function createAsrRouter(service: AsrService, config: RuntimeConfig) {
  const router = new Hono();

  router.get("/providers", (c) => {
    return c.json({ providers: service.listProviders() });
  });

  router.post("/sessions", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    try {
      const body = await c.req.json().catch(() => null);
      const session = await service.createSession(parseCreateBody(body));
      return c.json({
        ok: true,
        sessionId: session.sessionId,
        providerId: session.providerId,
        status: session.status,
      });
    } catch (error) {
      return handleAsrError(error);
    }
  });

  router.get("/sessions/:sessionId", (c) => {
    try {
      return c.json({ session: service.getSession(c.req.param("sessionId")) });
    } catch (error) {
      return handleAsrError(error);
    }
  });

  router.post("/sessions/:sessionId/audio", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    try {
      const chunk = new Uint8Array(await c.req.arrayBuffer());
      const session = await service.appendAudio(c.req.param("sessionId"), chunk);
      return c.json({ ok: true, status: session.status });
    } catch (error) {
      return handleAsrError(error);
    }
  });

  router.post("/sessions/:sessionId/finish", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    try {
      const session = await service.finishSession(c.req.param("sessionId"));
      return c.json({ ok: true, status: session.status });
    } catch (error) {
      return handleAsrError(error);
    }
  });

  router.post("/sessions/:sessionId/cancel", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    try {
      const session = await service.cancelSession(c.req.param("sessionId"));
      return c.json({ ok: true, status: session.status });
    } catch (error) {
      return handleAsrError(error);
    }
  });

  router.get("/sessions/:sessionId/events", async (c) => {
    const sessionId = c.req.param("sessionId");
    try {
      service.getSession(sessionId);
    } catch (error) {
      return handleAsrError(error);
    }

    const afterEventId = parseAfterEventId(c.req.query("after"));
    return streamSSE(c, async (stream) => {
      let cursor = afterEventId;
      let ready = false;
      const queued: AsrSessionEvent[] = [];
      let cleanup: ReturnType<typeof createCleanup> | null = null;
      cleanup = createCleanup(
        service.subscribe(sessionId, (event) => {
          if (event.eventId <= cursor) {
            return;
          }
          if (!ready) {
            queued.push(event);
            return;
          }
          cursor = event.eventId;
          void writeTerminalAwareEvent(stream, event).then((terminal) => {
            if (terminal) {
              cleanup?.close();
            }
          });
        }),
      );

      c.req.raw.signal.addEventListener("abort", cleanup.close);
      try {
        const buffered = service.readEventsAfter(sessionId, cursor);
        for (const event of buffered) {
          cursor = event.eventId;
          if (await writeTerminalAwareEvent(stream, event)) {
            return;
          }
        }
        ready = true;
        for (const event of queued) {
          if (event.eventId <= cursor) {
            continue;
          }
          cursor = event.eventId;
          if (await writeTerminalAwareEvent(stream, event)) {
            return;
          }
        }
        await runHeartbeat(stream, cleanup);
      } finally {
        cleanup.close();
      }
    });
  });

  return router;
}
