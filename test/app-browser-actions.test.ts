import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, SetStateAction } from "react";
import type { ProviderSummary } from "../api/types";
import {
  INITIAL_BROWSER,
  type BrowserState,
} from "../web/browser-state";
import {
  applySentSessionSelection,
  loadMoreBrowserSessions,
  refreshBrowserState,
  shouldRefreshBrowserAfterSend,
} from "../web/app-browser-actions";

const PROVIDER: ProviderSummary = {
  id: "codex",
  label: "Codex",
  description: "Codex provider",
  rootPath: "/tmp/codex",
  capabilities: {
    history: true,
    send: true,
    stream: true,
    attach: true,
    createSession: true,
    emptyCreateSession: true,
    modelSelection: true,
    threadState: true,
    interrupt: true,
    userInput: true,
  },
  status: {
    historyReadable: true,
    sendAvailable: true,
    configResolved: true,
    lastError: null,
  },
};

function createBrowserStateStore(initial: BrowserState) {
  let value = initial;
  const setValue: Dispatch<SetStateAction<BrowserState>> = (next) => {
    value = typeof next === "function" ? next(value) : next;
  };
  return {
    read: () => value,
    setValue,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test("refreshBrowserState ignores a late browser result after the request is aborted", async () => {
  const stateStore = createBrowserStateStore(INITIAL_BROWSER);
  const deferred = createDeferred<BrowserState>();
  let aborted = false;

  const pending = refreshBrowserState({
    loadBrowser: async () => deferred.promise,
    provider: PROVIDER,
    setBrowser: stateStore.setValue,
    shouldAbort: () => aborted,
  });

  await Promise.resolve();
  const newerState: BrowserState = {
    ...INITIAL_BROWSER,
    loading: false,
    sessions: [
      {
        id: "session-new",
        display: "new",
        timestamp: 2,
        project: "/tmp/new",
        projectName: "new",
      },
    ],
    selectedSessionId: "session-new",
  };
  stateStore.setValue(newerState);
  aborted = true;
  deferred.resolve({
    ...INITIAL_BROWSER,
    loading: false,
    sessions: [
      {
        id: "session-old",
        display: "old",
        timestamp: 1,
        project: "/tmp/old",
        projectName: "old",
      },
    ],
    selectedSessionId: "session-old",
  });

  await pending;

  assert.deepEqual(stateStore.read(), newerState);
});

test("loadMoreBrowserSessions ignores a late page after the request is aborted", async () => {
  const initial: BrowserState = {
    ...INITIAL_BROWSER,
    loading: false,
    nextBefore: "cursor-1",
    sessions: [
      {
        id: "session-current",
        display: "current",
        timestamp: 2,
        project: "/tmp/current",
        projectName: "current",
      },
    ],
    selectedSessionId: "session-current",
  };
  const stateStore = createBrowserStateStore(initial);
  const deferred = createDeferred<{
    nextBefore: string | null;
    sessions: BrowserState["sessions"];
  }>();
  let aborted = false;

  const pending = loadMoreBrowserSessions({
    browser: initial,
    loadPage: async () => deferred.promise,
    project: "/tmp/current",
    provider: PROVIDER,
    setBrowser: stateStore.setValue,
    shouldAbort: () => aborted,
  });

  await Promise.resolve();
  const replacementState: BrowserState = {
    ...INITIAL_BROWSER,
    loading: false,
    sessions: [
      {
        id: "session-replacement",
        display: "replacement",
        timestamp: 3,
        project: "/tmp/replacement",
        projectName: "replacement",
      },
    ],
    selectedSessionId: "session-replacement",
  };
  stateStore.setValue(replacementState);
  aborted = true;
  deferred.resolve({
    nextBefore: null,
    sessions: [
      {
        id: "session-late",
        display: "late",
        timestamp: 1,
        project: "/tmp/late",
        projectName: "late",
      },
    ],
  });

  await pending;

  assert.deepEqual(stateStore.read(), replacementState);
});

test("applySentSessionSelection promotes the selected draft session into the real session", () => {
  const nextState = applySentSessionSelection(
    {
      ...INITIAL_BROWSER,
      sessions: [
        {
          id: "draft:1",
          isDraft: true,
          display: "新会话",
          timestamp: 10,
          project: "/tmp/project",
          projectName: "project",
        },
        {
          id: "session-old",
          display: "old",
          timestamp: 5,
          project: "/tmp/project",
          projectName: "project",
        },
      ],
      selectedSessionId: "draft:1",
    },
    "session-real",
  );

  assert.deepEqual(
    nextState.sessions.map((session) => session.id),
    ["session-real", "session-old"],
  );
  assert.equal(nextState.sessions[0]?.isDraft, undefined);
  assert.equal(nextState.selectedSessionId, "session-real");
});

test("stream-backed providers do not need a browser reload after send", () => {
  assert.equal(shouldRefreshBrowserAfterSend(PROVIDER), false);
  assert.equal(
    shouldRefreshBrowserAfterSend({
      ...PROVIDER,
      id: "claude",
      label: "Claude",
      capabilities: {
        ...PROVIDER.capabilities,
        stream: false,
      },
    }),
    true,
  );
});
