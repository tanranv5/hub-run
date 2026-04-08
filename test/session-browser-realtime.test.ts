import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "../api/types";
import type { BrowserState } from "../web/browser-state";
import {
  applySessionsSnapshot,
  applySessionsUpdate,
  buildSessionsStreamUrl,
} from "../web/browser-realtime";
import {
  readSessionsStreamState,
  shouldConnectSessionsStream,
} from "../web/use-provider-sessions-stream";

const SESSION_1: SessionSummary = {
  id: "session-1",
  display: "老会话",
  timestamp: 1000,
  project: "/workspace/app",
  projectName: "app",
};

const SESSION_2: SessionSummary = {
  id: "session-2",
  display: "当前会话",
  timestamp: 2000,
  project: "/workspace/app",
  projectName: "app",
};

const SESSION_3: SessionSummary = {
  id: "session-3",
  display: "新会话",
  timestamp: 3000,
  project: "/workspace/app",
  projectName: "app",
};

const OTHER_PROJECT_SESSION: SessionSummary = {
  id: "session-other",
  display: "其他项目会话",
  timestamp: 4000,
  project: "/workspace/other",
  projectName: "other",
};

const BASE_BROWSER: BrowserState = {
  sessions: [SESSION_2, SESSION_1],
  deletedSessionIds: new Set(),
  nextBefore: "2",
  totalSessionCount: 2,
  selectedSessionId: SESSION_2.id,
  streamStatus: {
    phase: "idle",
    lastEventAt: null,
    retryCount: 0,
  },
  loading: true,
  loadingMore: false,
  error: "old error",
};

const STREAM_PROVIDER = {
  capabilities: {
    stream: true,
  },
} as const;

test("sessions snapshot replaces loaded window and keeps selected session when still present", () => {
  const nextState = applySessionsSnapshot(BASE_BROWSER, {
    sessions: [SESSION_3, SESSION_2],
    nextBefore: "2",
    totalCount: 27,
  });

  assert.deepEqual(
    nextState.sessions.map((session) => session.id),
    ["session-3", "session-2"],
  );
  assert.equal(nextState.selectedSessionId, "session-2");
  assert.equal(nextState.totalSessionCount, 27);
  assert.equal(nextState.loading, false);
  assert.equal(nextState.error, null);
});

test("sessions snapshot marks realtime stream as live once the snapshot arrives", () => {
  const nextState = applySessionsSnapshot(
    {
      ...(BASE_BROWSER as BrowserState),
      streamStatus: {
        phase: "connecting",
        lastEventAt: null,
        retryCount: 0,
      },
    } as BrowserState,
    {
      sessions: [SESSION_3, SESSION_2],
      nextBefore: "2",
      totalCount: 27,
    },
  ) as BrowserState & {
    streamStatus?: { phase?: string; lastEventAt?: number | null };
  };

  assert.equal(nextState.streamStatus?.phase, "live");
  assert.equal(typeof nextState.streamStatus?.lastEventAt, "number");
});

test("sessions snapshot does not re-inject a selected session from another project", () => {
  const nextState = applySessionsSnapshot(
    {
      ...BASE_BROWSER,
      sessions: [OTHER_PROJECT_SESSION],
      selectedSessionId: OTHER_PROJECT_SESSION.id,
    },
    {
      sessions: [SESSION_3, SESSION_2],
      nextBefore: "2",
      totalCount: 27,
    },
    "/workspace/app",
  );

  assert.deepEqual(
    nextState.sessions.map((session) => session.id),
    ["session-3", "session-2"],
  );
  assert.equal(nextState.selectedSessionId, "session-3");
});

test("sessions update merges upserts removes vanished items and falls back selection", () => {
  const nextState = applySessionsUpdate(BASE_BROWSER, {
    upserts: [SESSION_3],
    removedIds: ["session-2"],
    nextBefore: "2",
    totalCount: 28,
  });

  assert.deepEqual(
    nextState.sessions.map((session) => session.id),
    ["session-3", "session-1"],
  );
  assert.equal(nextState.selectedSessionId, "session-3");
  assert.equal(nextState.nextBefore, "2");
  assert.equal(nextState.totalSessionCount, 28);
});

test("sessions update clears reconnecting state after receiving fresh data", () => {
  const nextState = applySessionsUpdate(
    {
      ...(BASE_BROWSER as BrowserState),
      streamStatus: {
        phase: "reconnecting",
        lastEventAt: 100,
        retryCount: 2,
      },
    } as BrowserState,
    {
      upserts: [SESSION_3],
      removedIds: [],
      nextBefore: "2",
      totalCount: 28,
    },
  ) as BrowserState & {
    streamStatus?: { phase?: string; retryCount?: number };
  };

  assert.equal(nextState.streamStatus?.phase, "live");
  assert.equal(nextState.streamStatus?.retryCount, 0);
});

test("sessions stream still connects after initial load even when the list is empty", () => {
  assert.equal(
    shouldConnectSessionsStream(
      {
        ...(BASE_BROWSER as BrowserState),
        sessions: [],
        loading: false,
      },
      STREAM_PROVIDER as never,
    ),
    true,
  );
});

test("sessions stream subscription state only tracks loaded size and draft presence", () => {
  assert.deepEqual(
    readSessionsStreamState(BASE_BROWSER),
    readSessionsStreamState({
      ...BASE_BROWSER,
      sessions: [SESSION_3, SESSION_1],
    }),
  );
});

test("sessions stream loaded size stays on the server window even when UI injects a preferred old session", () => {
  assert.deepEqual(
    readSessionsStreamState({
      ...BASE_BROWSER,
      sessions: [SESSION_3, SESSION_2, SESSION_1],
      nextBefore: "2",
      totalSessionCount: 27,
    }),
    {
      loaded: 2,
      hasDraftSession: false,
    },
  );
});

test("sessions stream loaded size falls back to total count when all sessions are already loaded", () => {
  assert.deepEqual(
    readSessionsStreamState({
      ...BASE_BROWSER,
      sessions: [SESSION_3, SESSION_2, SESSION_1],
      nextBefore: null,
      totalSessionCount: 3,
    }),
    {
      loaded: 3,
      hasDraftSession: false,
    },
  );
});

test("sessions stream url encodes loaded count and project filter", () => {
  assert.equal(
    buildSessionsStreamUrl("codex", 20, "/workspace/app alpha"),
    "/api/providers/codex/sessions/stream?loaded=20&project=%2Fworkspace%2Fapp+alpha",
  );
});
