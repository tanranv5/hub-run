import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProviderSummary, SessionSummary } from "../api/types";
import SessionBrowser from "../web/components/session-browser";
import { SessionBrowserList } from "../web/components/session-browser-list";

Object.assign(globalThis, { React });

const PROVIDER: ProviderSummary = {
  id: "codex",
  label: "Codex",
  description: "OpenAI Codex provider shell",
  rootPath: "/Users/tanran/.codex",
  capabilities: {
    history: true,
    send: true,
    stream: false,
    attach: true,
    createSession: true,
    emptyCreateSession: false,
    modelSelection: true,
    threadState: false,
    interrupt: false,
    userInput: false,
  },
  status: {
    historyReadable: true,
    sendAvailable: true,
    configResolved: true,
    lastError: null,
  },
};

function buildSession(index: number): SessionSummary {
  return {
    id: `session-${index}`,
    display: `虚拟列表会话 ${index}`,
    timestamp: 1770000000000 - index * 1_000,
    project: "/Users/tanran/aiCode/cw/hub-run",
    projectName: "hub-run",
  };
}

test("session browser does not fully render a long list on first paint", () => {
  const sessions = Array.from({ length: 40 }, (_, index) => buildSession(index));
  const markup = renderToStaticMarkup(
    React.createElement(SessionBrowser as unknown as React.ComponentType<any>, {
      provider: PROVIDER,
      projects: ["/Users/tanran/aiCode/cw/hub-run"],
      sessions,
      nextBefore: null,
      loading: false,
      loadingMore: false,
      selectedProject: null,
      selectedSessionId: sessions[0]?.id ?? null,
      newSessionCwd: "/Users/tanran/aiCode/cw/hub-run",
      creatingSession: false,
      onNewSessionCwdChange: () => {},
      onCreateSession: () => {},
      onLoadMore: () => {},
      onSelectProject: () => {},
      onSelectSession: () => {},
    }),
  );

  const renderedCount = (markup.match(/虚拟列表会话/g) ?? []).length;

  assert.match(markup, /40 条会话/);
  assert.ok(
    renderedCount < sessions.length,
    `expected virtualized first paint, but rendered ${renderedCount} of ${sessions.length} sessions`,
  );
});

test("session browser list keeps latest-first order across projects without project headers", () => {
  const sessions: SessionSummary[] = [
    {
      id: "session-a-1",
      display: "第一条",
      timestamp: 3_000,
      project: "/Users/tanran/a",
      projectName: "a",
    },
    {
      id: "session-b-1",
      display: "第二条",
      timestamp: 2_000,
      project: "/Users/tanran/b",
      projectName: "b",
    },
    {
      id: "session-a-2",
      display: "第三条",
      timestamp: 1_000,
      project: "/Users/tanran/a",
      projectName: "a",
    },
  ];
  const markup = renderToStaticMarkup(
    React.createElement(SessionBrowserList as unknown as React.ComponentType<any>, {
      sessions,
      selectedSessionId: sessions[0]?.id ?? null,
      onSelectSession: () => {},
    }),
  );

  const firstIndex = markup.indexOf("第一条");
  const secondIndex = markup.indexOf("第二条");
  const thirdIndex = markup.indexOf("第三条");
  assert.ok(firstIndex >= 0 && secondIndex > firstIndex && thirdIndex > secondIndex);
  assert.doesNotMatch(markup, /header:a|header:b|\(无项目\)/);
});
