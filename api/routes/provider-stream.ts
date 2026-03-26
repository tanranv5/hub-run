import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SSEStreamingApi } from "hono/streaming";
import { paginateSessions } from "../providers/shared";
import type {
  ProviderAdapter,
  ProviderId,
  SessionSummary,
} from "../types";
import { findAdapter } from "./providers";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_SLICE_MS = 1_000;
const DEFAULT_PAGE_SIZE = 10;

interface SessionsWindow {
  sessions: SessionSummary[];
  nextBefore: string | null;
}

type EventStreamWriter = Pick<SSEStreamingApi, "writeSSE">;
type HeartbeatStream = Pick<SSEStreamingApi, "sleep" | "writeSSE">;
type ConversationStreamReader = NonNullable<ProviderAdapter["getConversationStream"]>;

function providerNotFound() {
  return {
    error: { code: "INTERNAL_ERROR", message: "Provider not found" },
  };
}

function unsupportedCapability(message: string) {
  return {
    error: { code: "UNSUPPORTED_CAPABILITY", message },
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function filterSessionsByProject(
  sessions: SessionSummary[],
  project: string | undefined,
) {
  const normalized = project?.trim();
  if (!normalized) {
    return sessions;
  }
  return sessions.filter((session) => session.project === normalized);
}

function sessionSignature(session: SessionSummary): string {
  return JSON.stringify(session);
}

function diffSessions(previous: SessionSummary[], next: SessionSummary[]) {
  const previousMap = new Map(
    previous.map((session) => [session.id, sessionSignature(session)]),
  );
  const nextIds = new Set(next.map((session) => session.id));
  const upserts = next.filter(
    (session) => previousMap.get(session.id) !== sessionSignature(session),
  );
  const removedIds = previous
    .filter((session) => !nextIds.has(session.id))
    .map((session) => session.id);
  return { removedIds, upserts };
}

async function readSessionsWindow(
  adapter: ProviderAdapter,
  loaded: number,
  project: string | undefined,
): Promise<SessionsWindow> {
  return paginateSessions(
    filterSessionsByProject(await adapter.listSessions(), project),
    null,
    loaded,
  );
}

async function runHeartbeat(
  stream: HeartbeatStream,
  isClosed: () => boolean,
) {
  while (!isClosed()) {
    await stream.writeSSE({
      event: "heartbeat",
      data: JSON.stringify({ timestamp: Date.now() }),
    });
    await waitForHeartbeatWindow(stream, isClosed);
  }
}

async function waitForHeartbeatWindow(
  stream: Pick<SSEStreamingApi, "sleep">,
  isClosed: () => boolean,
) {
  let remaining = HEARTBEAT_INTERVAL_MS;
  while (remaining > 0 && !isClosed()) {
    const slice = Math.min(HEARTBEAT_SLICE_MS, remaining);
    await stream.sleep(slice);
    remaining -= slice;
  }
}

function createCleanup(
  onClose: () => void,
) {
  let closed = false;
  return {
    isClosed: () => closed,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      onClose();
    },
  };
}

function createPumpErrorHandler(
  label: string,
  cleanup: ReturnType<typeof createCleanup>,
) {
  return (error: unknown) => {
    console.error(`${label} failed`, error);
    cleanup.close();
  };
}

function createConversationDeltaPump(props: {
  stream: EventStreamWriter;
  isClosed: () => boolean;
  readConversationStream: ConversationStreamReader;
  sessionId: string;
  readOffset: () => number;
  writeOffset: (nextOffset: number) => void;
}) {
  const {
    isClosed,
    readConversationStream,
    readOffset,
    sessionId,
    stream,
    writeOffset,
  } = props;
  let running = false;
  let pending = false;

  return async function pumpConversationDelta(): Promise<void> {
    pending = true;
    if (running) {
      return;
    }

    running = true;
    try {
      while (pending && !isClosed()) {
        pending = false;
        await emitConversationDelta(
          stream,
          isClosed,
          readConversationStream,
          sessionId,
          readOffset,
          writeOffset,
        );
      }
    } finally {
      running = false;
    }
  };
}

function createSessionsUpdatePump(props: {
  stream: EventStreamWriter;
  isClosed: () => boolean;
  adapter: ProviderAdapter;
  loaded: number;
  project: string | undefined;
  readCurrentWindow: () => SessionsWindow;
  writeCurrentWindow: (nextWindow: SessionsWindow) => void;
}) {
  const { adapter, isClosed, loaded, project, readCurrentWindow, stream, writeCurrentWindow } =
    props;
  let running = false;
  let pending = false;

  return async function pumpSessionsUpdate(): Promise<void> {
    pending = true;
    if (running) {
      return;
    }

    running = true;
    try {
      while (pending && !isClosed()) {
        pending = false;
        await emitSessionsUpdate(
          stream,
          isClosed,
          adapter,
          loaded,
          project,
          readCurrentWindow,
          writeCurrentWindow,
        );
      }
    } finally {
      running = false;
    }
  };
}

export function registerProviderStreamRoutes(
  router: Hono,
  registry: Record<ProviderId, ProviderAdapter>,
) {
  router.get("/:providerId/sessions/stream", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json(providerNotFound(), 404);
    }
    const subscribeSessions = adapter.subscribeSessions;
    if (!subscribeSessions) {
      return c.json(
        unsupportedCapability("Provider does not support realtime sessions"),
        400,
      );
    }

    const loaded = parsePositiveInt(c.req.query("loaded"), DEFAULT_PAGE_SIZE);
    const project = c.req.query("project");

    return streamSSE(c, async (stream) => {
      let currentWindow: SessionsWindow = {
        sessions: [],
        nextBefore: null,
      };
      let snapshotReady = false;
      let backlogPending = false;
      let unsubscribe: (() => void) | null = null;
      const cleanup = createCleanup(() => {
        unsubscribe?.();
      });
      const onPumpError = createPumpErrorHandler(
        "provider sessions stream update pump",
        cleanup,
      );
      const pumpSessionsUpdate = createSessionsUpdatePump({
        stream,
        isClosed: cleanup.isClosed,
        adapter,
        loaded,
        project,
        readCurrentWindow: () => currentWindow,
        writeCurrentWindow: (nextWindow) => {
          currentWindow = nextWindow;
        },
      });
      unsubscribe = subscribeSessions(() => {
        if (!snapshotReady) {
          backlogPending = true;
          return;
        }
        void pumpSessionsUpdate().catch(onPumpError);
      });

      c.req.raw.signal.addEventListener("abort", cleanup.close);
      try {
        currentWindow = await readSessionsWindow(adapter, loaded, project);
        await stream.writeSSE({
          event: "sessions",
          data: JSON.stringify(currentWindow),
        });
        snapshotReady = true;
        if (backlogPending) {
          backlogPending = false;
          await pumpSessionsUpdate();
        }
        await runHeartbeat(stream, cleanup.isClosed);
      } finally {
        cleanup.close();
      }
    });
  });

  router.get("/:providerId/sessions/:sessionId/messages/stream", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json(providerNotFound(), 404);
    }
    const subscribeConversation = adapter.subscribeConversation;
    const readConversationStream = adapter.getConversationStream;
    const readConversationStreamCursor = adapter.getConversationStreamCursor;
    if (
      !subscribeConversation ||
      !readConversationStream ||
      !readConversationStreamCursor
    ) {
      return c.json(
        unsupportedCapability("Provider does not support realtime conversation"),
        400,
      );
    }

    const sessionId = c.req.param("sessionId");
    const limit = parsePositiveInt(c.req.query("limit"), DEFAULT_PAGE_SIZE);
    const requestedOffset = parsePositiveInt(c.req.query("offset"), 0);

    return streamSSE(c, async (stream) => {
      let offset = requestedOffset;
      let conversationReady = requestedOffset > 0;
      let backlogPending = false;
      let unsubscribe: (() => void) | null = null;
      const cleanup = createCleanup(() => {
        unsubscribe?.();
      });
      const onPumpError = createPumpErrorHandler(
        "provider conversation stream delta pump",
        cleanup,
      );
      const pumpConversationDelta = createConversationDeltaPump({
        stream,
        isClosed: cleanup.isClosed,
        readConversationStream,
        sessionId,
        readOffset: () => offset,
        writeOffset: (nextOffset) => {
          offset = nextOffset;
        },
      });
      unsubscribe = subscribeConversation(sessionId, () => {
        if (!conversationReady) {
          backlogPending = true;
          return;
        }
        void pumpConversationDelta().catch(onPumpError);
      });

      c.req.raw.signal.addEventListener("abort", cleanup.close);
      try {
        if (requestedOffset > 0) {
          await pumpConversationDelta();
        } else {
          offset = await readConversationStreamCursor(sessionId);
          const page = await adapter.getConversationPage(sessionId, null, limit);
          await stream.writeSSE({
            event: "conversation",
            data: JSON.stringify({
              ...page,
              nextOffset: offset,
            }),
          });
        }
        conversationReady = true;
        if (backlogPending) {
          backlogPending = false;
          await pumpConversationDelta();
        }
        await runHeartbeat(stream, cleanup.isClosed);
      } finally {
        cleanup.close();
      }
    });
  });
}

async function emitSessionsUpdate(
  stream: EventStreamWriter,
  isClosed: () => boolean,
  adapter: ProviderAdapter,
  loaded: number,
  project: string | undefined,
  readCurrentWindow: () => SessionsWindow,
  writeCurrentWindow: (nextWindow: SessionsWindow) => void,
) {
  if (isClosed()) {
    return;
  }

  const nextWindow = await readSessionsWindow(adapter, loaded, project);
  const currentWindow = readCurrentWindow();
  const diff = diffSessions(currentWindow.sessions, nextWindow.sessions);
  if (
    diff.upserts.length === 0 &&
    diff.removedIds.length === 0 &&
    currentWindow.nextBefore === nextWindow.nextBefore
  ) {
    return;
  }

  writeCurrentWindow(nextWindow);
  await stream.writeSSE({
    event: "sessionsUpdate",
    data: JSON.stringify({
      ...diff,
      nextBefore: nextWindow.nextBefore,
    }),
  });
}

async function emitConversationDelta(
  stream: EventStreamWriter,
  isClosed: () => boolean,
  readConversationStream: ConversationStreamReader,
  sessionId: string,
  readOffset: () => number,
  writeOffset: (nextOffset: number) => void,
) {
  if (isClosed()) {
    return;
  }

  const payload = await readConversationStream(sessionId, readOffset());
  writeOffset(payload.nextOffset);
  if (payload.messages.length === 0) {
    return;
  }

  await stream.writeSSE({
    event: "messages",
    data: JSON.stringify(payload),
  });
}
