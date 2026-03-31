import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProviderSummary, SessionSummary } from "../api/types";
import BrowserSidebar from "../web/components/browser-sidebar";
import { canInterruptConversation } from "../web/components/conversation-panel";
import ConversationHeader from "../web/components/conversation-header";
import ConversationTimeline from "../web/components/conversation-timeline";
import { resolveConversationStatus } from "../web/conversation-status";

Object.assign(globalThis, { React });

const PROVIDER: ProviderSummary = {
  id: "codex",
  label: "Codex",
  description: "OpenAI Codex app-server provider shell",
  rootPath: "/Users/tanran/.codex",
  capabilities: {
    history: true,
    send: true,
    stream: false,
    attach: true,
    createSession: true,
    emptyCreateSession: false,
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

const SESSION: SessionSummary = {
  id: "thread-1",
  display: "补齐 codex app-server 状态监控",
  timestamp: 1770000000000,
  project: "/Users/tanran/aiCode/cw/hub-run",
  projectName: "hub-run",
};

test("conversation header shows codex runtime status without a duplicate interrupt action", () => {
  const conversationStatus = resolveConversationStatus({
    interrupting: false,
    lifecycle: null,
    loading: false,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    sendAvailable: true,
    streamStatus: { phase: "reconnecting", lastEventAt: null, retryCount: 1 },
    threadState: {
      threadId: SESSION.id,
      activeTurnId: "turn-9",
      isGenerating: true,
      requestedTurnId: "turn-9",
      requestedTurnStatus: "inProgress",
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(ConversationHeader as unknown as React.ComponentType<any>, {
      conversationStatus,
      session: SESSION,
      onToggleDesktopSidebar: () => {},
    }),
  );

  assert.doesNotMatch(markup, /turn-9/);
  assert.match(markup, /data-slot="conversation-session-status"/);
  assert.match(markup, /data-slot="conversation-session-status-tooltip"/);
  assert.match(markup, />正在生成\.\.\.</);
  assert.match(markup, /aria-label="复制会话 ID"/);
  assert.match(markup, /data-slot="session-copy-tooltip"/);
  assert.match(markup, /thread-1/);
  assert.doesNotMatch(markup, /title="复制会话 ID: thread-1"/);
  assert.doesNotMatch(markup, /title="正在生成\.\.\."/);
  assert.match(markup, /bg-accent/);
  const metaIndex = markup.indexOf('data-region="conversation-header-meta"');
  const copyIndex = markup.indexOf('aria-label="复制会话 ID"');
  const statusIndex = markup.indexOf('data-slot="conversation-session-status"');
  assert.notEqual(metaIndex, -1);
  assert.notEqual(copyIndex, -1);
  assert.notEqual(statusIndex, -1);
  assert.ok(metaIndex < copyIndex);
  assert.ok(copyIndex < statusIndex);
  assert.doesNotMatch(markup, /aria-label="中断当前回合"/);
});

test("conversation timeline renders pending codex user input requests", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationTimeline as unknown as React.ComponentType<any>, {
      error: null,
      hasOlderMessages: false,
      loading: false,
      loadingOlder: false,
      messages: [],
      pendingUserInputRequests: [
        {
          requestId: "req-1",
          threadId: SESSION.id,
          turnId: "turn-9",
          itemId: "item-req-1",
          questions: [
            {
              id: "confirm",
              header: "继续执行",
              question: "请选择下一步",
              isOther: false,
              isSecret: false,
              options: [
                {
                  label: "继续",
                  description: "批准继续执行",
                },
              ],
            },
          ],
        },
      ],
      respondingRequestId: null,
      summary: null,
      onLoadOlder: () => {},
      onRespondUserInput: () => {},
    }),
  );

  assert.match(markup, /继续执行/);
  assert.match(markup, /请选择下一步/);
  assert.match(markup, />继续</);
});

test("conversation timeline offers load-to-first button after loading older history more than ten times", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationTimeline as unknown as React.ComponentType<any>, {
      error: null,
      hasOlderMessages: true,
      loading: false,
      loadingOlder: false,
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          kind: "text",
          text: "最新一条",
        },
      ],
      olderLoadCount: 11,
      pendingUserInputRequests: [],
      respondingRequestId: null,
      summary: null,
      onLoadOlder: () => {},
      onLoadOlderToStart: () => {},
      onRespondUserInput: () => {},
    }),
  );

  assert.match(markup, /加载更多历史数据/);
  assert.match(markup, /加载到首条/);
});

test("conversation header status reflects completed turn when generation has ended", () => {
  const conversationStatus = resolveConversationStatus({
    interrupting: false,
    lifecycle: null,
    loading: false,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    sendAvailable: true,
    streamStatus: { phase: "live", lastEventAt: null, retryCount: 0 },
    threadState: {
      threadId: SESSION.id,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-10",
      requestedTurnStatus: "completed",
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(ConversationHeader as unknown as React.ComponentType<any>, {
      conversationStatus,
      session: SESSION,
      onToggleDesktopSidebar: () => {},
    }),
  );

  assert.match(markup, /data-slot="conversation-session-status-tooltip"/);
  assert.match(markup, />当前回合已完成</);
  assert.match(markup, /bg-accent-2/);
});

test("conversation header status keeps runtime completed state over a live message stream heartbeat", () => {
  const conversationStatus = resolveConversationStatus({
    interrupting: false,
    lifecycle: null,
    loading: false,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    sendAvailable: true,
    streamStatus: { phase: "live", lastEventAt: Date.now(), retryCount: 0 },
    threadState: {
      threadId: SESSION.id,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-10",
      requestedTurnStatus: "completed",
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(ConversationHeader as unknown as React.ComponentType<any>, {
      conversationStatus,
      session: SESSION,
      onToggleDesktopSidebar: () => {},
    }),
  );

  assert.match(markup, />当前回合已完成</);
  assert.doesNotMatch(markup, />正在生成\.\.\.</);
});

test("conversation header status does not infer generating from a live stream heartbeat when runtime already reports interrupted", () => {
  const conversationStatus = resolveConversationStatus({
    interrupting: false,
    lifecycle: null,
    loading: false,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    sendAvailable: true,
    streamStatus: { phase: "idle", lastEventAt: null, retryCount: 0 },
    threadState: {
      threadId: SESSION.id,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-11",
      requestedTurnStatus: "interrupted",
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(ConversationHeader as unknown as React.ComponentType<any>, {
      conversationStatus,
      session: SESSION,
      onToggleDesktopSidebar: () => {},
    }),
  );

  assert.match(markup, /data-slot="conversation-session-status-tooltip"/);
  assert.match(markup, />当前回合已中断</);
  assert.match(markup, /bg-danger/);
  assert.doesNotMatch(markup, /title="正在生成..."/);
});

test("conversation header status shows syncing when the runtime snapshot is marked desynced", () => {
  const conversationStatus = resolveConversationStatus({
    interrupting: false,
    lifecycle: null,
    loading: false,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    sendAvailable: true,
    streamStatus: { phase: "idle", lastEventAt: null, retryCount: 0 },
    threadState: {
      threadId: SESSION.id,
      activeTurnId: null,
      isGenerating: false,
      requestedTurnId: "turn-11",
      requestedTurnStatus: null,
      desynced: true,
      rawRequestedTurnStatus: "interrupted",
      desyncReason: "messageTailAheadOfThreadSnapshot",
    } as any,
  });
  const markup = renderToStaticMarkup(
    React.createElement(ConversationHeader as unknown as React.ComponentType<any>, {
      conversationStatus,
      session: SESSION,
      onToggleDesktopSidebar: () => {},
    }),
  );

  assert.match(markup, /状态同步中/);
  assert.match(markup, /bg-accent/);
});

test("conversation header status uses a neutral ready color before any task starts", () => {
  const conversationStatus = resolveConversationStatus({
    interrupting: false,
    lifecycle: null,
    loading: false,
    pendingUserInputRequests: [],
    providerId: "codex",
    respondingRequestId: null,
    sendAvailable: true,
    streamStatus: { phase: "idle", lastEventAt: null, retryCount: 0 },
    threadState: null,
  });
  const markup = renderToStaticMarkup(
    React.createElement(ConversationHeader as unknown as React.ComponentType<any>, {
      conversationStatus,
      session: SESSION,
      onToggleDesktopSidebar: () => {},
    }),
  );

  assert.match(markup, /data-slot="conversation-session-status-tooltip"/);
  assert.match(markup, />就绪</);
  assert.match(markup, /bg-muted/);
});

test("interrupt action ignores heartbeat-only live stream when the runtime state is already completed", () => {
  assert.equal(
    canInterruptConversation({
      interruptAvailable: true,
      loading: false,
      sendLifecycle: null,
      streamStatus: {
        phase: "live",
        lastEventAt: Date.now(),
        retryCount: 0,
      },
      threadState: {
        threadId: SESSION.id,
        activeTurnId: null,
        isGenerating: false,
        requestedTurnId: "turn-10",
        requestedTurnStatus: "completed",
      },
    }),
    false,
  );
});

test("browser sidebar no longer renders list stream status chip", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BrowserSidebar as unknown as React.ComponentType<any>, {
      browser: {
        sessions: [SESSION],
        nextBefore: null,
        selectedSessionId: SESSION.id,
        loading: false,
        loadingMore: false,
        streamStatus: {
          phase: "reconnecting",
          label: "会话流重连中",
        },
      },
      creatingSession: false,
      newSessionCwd: SESSION.project,
      open: false,
      desktopOpen: true,
      projects: [SESSION.project],
      selectedProject: SESSION.project,
      provider: PROVIDER,
      onClose: () => {},
      onCreateSession: () => {},
      onLoadMore: () => {},
      onNewSessionCwdChange: () => {},
      onSelectProject: () => {},
      onSelectSession: () => {},
    }),
  );

  assert.doesNotMatch(markup, /会话列表流重连中/);
});
