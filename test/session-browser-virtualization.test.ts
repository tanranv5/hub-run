import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProviderSummary, SessionSummary } from "../api/types";
import SessionBrowser from "../web/components/session-browser";

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
