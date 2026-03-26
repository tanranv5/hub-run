import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProviderSummary, SessionSummary } from "../api/types";
import AppHeader from "../web/components/app-header";
import BrowserSidebar from "../web/components/browser-sidebar";
import ConversationPanel, { ConversationBody } from "../web/components/conversation-panel";
import { ConversationMessageCard } from "../web/components/conversation-message";
import SessionBrowser from "../web/components/session-browser";
import type { ConversationStatus } from "../web/conversation-status";

Object.assign(globalThis, { React });

const PROVIDER: ProviderSummary = {
  id: "codex",
  label: "Codex",
  description: "OpenAI Codex CLI provider shell",
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

const SESSION: SessionSummary = {
  id: "session-1",
  display: "ai软着，需要心理ai方面的源代码，是10号字70度斜体排版验证用超长标题",
  timestamp: 1770000000000,
  project: "/Users/tanran/aiCode/cw/hub-run",
  projectName: "hub-run",
};

test("app header renders real provider status instead of placeholder language toggle", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AppHeader, {
      authEnabled: true,
      provider: PROVIDER,
      providers: [PROVIDER],
      onSelectProvider: () => {},
      onOpenBrowser: () => {},
      onRefresh: () => {},
      onLogout: () => {},
    }),
  );

  assert.doesNotMatch(markup, /EN\/ZH/);
  assert.doesNotMatch(markup, /可发送/);
  assert.match(markup, /刷新消息/);
});

test("conversation panel keeps composer focused on send controls instead of provider badges", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationPanel as unknown as React.ComponentType<any>, {
      effortOptions: ["low", "medium", "high"],
      modelOptions: [
        {
          id: "gpt-5-codex",
          displayName: "GPT-5 Codex",
          description: "default",
          isDefault: true,
          hidden: false,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium", "high"],
        },
      ],
      provider: PROVIDER,
      selectedEffort: "high",
      selectedModelId: "gpt-5-codex",
      session: SESSION,
      sendMessage: async () => ({ sessionId: "session-1", turnId: null }),
      onMessageSent: async () => undefined,
      onOpenBrowser: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onToggleDesktopSidebar: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.doesNotMatch(markup, />Codex</);
  assert.match(markup, /data-slot="conversation-session-status"/);
  assert.match(markup, /状态加载中/);
  assert.match(markup, /animate-pulse/);
  assert.match(markup, /GPT-5 Codex/);
  assert.match(markup, /high/);
  assert.match(markup, /语音/);
  assert.match(markup, /md:absolute md:right-3 md:top-3/);
  assert.match(markup, /aria-label="复制会话 ID"/);
  assert.match(markup, /data-slot="composer-actions"/);
  assert.match(markup, /justify-end gap-2/);
  assert.match(markup, /ai软着，需要心理ai方面的源代码，是10号字70度斜体排版/);
  assert.match(markup, /hub-run/);
  assert.match(markup, /min-h-0 flex-1 flex-col/);
  assert.match(markup, /h-full overflow-y-auto/);
  assert.match(markup, /placeholder="加载中\.\.\."/);
  assert.doesNotMatch(markup, /Message Hub-Run/);
});

test("session browser shows create-session controls and session totals", () => {
  const markup = renderToStaticMarkup(
    React.createElement(SessionBrowser as unknown as React.ComponentType<any>, {
      provider: PROVIDER,
      projects: [
        "/Users/tanran/aiCode/cw/hub-run",
        "/Users/tanran/.claude",
      ],
      sessions: [SESSION, { ...SESSION, id: "session-2" }],
      nextBefore: null,
      loading: false,
      loadingMore: false,
      selectedProject: null,
      selectedSessionId: SESSION.id,
      newSessionCwd: "/Users/tanran/aiCode/cw/hub-run",
      creatingSession: false,
      onNewSessionCwdChange: () => {},
      onCreateSession: () => {},
      onLoadMore: () => {},
      onSelectProject: () => {},
      onSelectSession: () => {},
    }),
  );

  assert.match(markup, /2 条会话/);
  assert.match(markup, /项目路径/);
  assert.match(markup, /aria-label="展开项目列表"/);
  assert.doesNotMatch(markup, /<datalist/);
  assert.match(markup, /aria-label="新建会话"/);
  assert.doesNotMatch(markup, />新建会话</);
  assert.match(markup, /ai软着，需要心理ai方面的源代码，是10号字70度斜体排版/);
});

test("desktop browser sidebar exposes resize handle and default width", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BrowserSidebar as unknown as React.ComponentType<any>, {
      browser: {
        sessions: [SESSION],
        nextBefore: null,
        selectedSessionId: SESSION.id,
        streamStatus: {
          phase: "idle",
          lastEventAt: null,
          retryCount: 0,
        },
        loading: false,
        loadingMore: false,
      },
      creatingSession: false,
      newSessionCwd: SESSION.project,
      open: false,
      desktopOpen: true,
      projects: [SESSION.project],
      selectedProject: null,
      provider: PROVIDER,
      onClose: () => {},
      onCreateSession: () => {},
      onLoadMore: () => {},
      onNewSessionCwdChange: () => {},
      onSelectProject: () => {},
      onSelectSession: () => {},
    }),
  );

  assert.match(markup, /aria-label="调整侧栏宽度"/);
  assert.match(markup, /style="width:320px"/);
});

test("browser sidebar shows blocking spinner while sessions are still loading", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BrowserSidebar as unknown as React.ComponentType<any>, {
      browser: {
        sessions: [],
        nextBefore: null,
        selectedSessionId: null,
        streamStatus: {
          phase: "idle",
          lastEventAt: null,
          retryCount: 0,
        },
        loading: true,
        loadingMore: false,
      },
      creatingSession: false,
      newSessionCwd: "",
      open: false,
      desktopOpen: true,
      projects: [],
      selectedProject: null,
      provider: PROVIDER,
      onClose: () => {},
      onCreateSession: () => {},
      onLoadMore: () => {},
      onNewSessionCwdChange: () => {},
      onSelectProject: () => {},
      onSelectSession: () => {},
    }),
  );

  assert.match(markup, /aria-label="正在加载会话\.\.\."|aria-label="正在加载会话..."/);
  assert.doesNotMatch(markup, /搜索会话/);
});

test("browser sidebar blocks interaction during project-switch loading even with stale sessions", () => {
  const markup = renderToStaticMarkup(
    React.createElement(BrowserSidebar as unknown as React.ComponentType<any>, {
      browser: {
        sessions: [SESSION],
        nextBefore: null,
        selectedSessionId: SESSION.id,
        streamStatus: {
          phase: "idle",
          lastEventAt: null,
          retryCount: 0,
        },
        loading: true,
        loadingMore: false,
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

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-label="正在加载会话\.\.\."|aria-label="正在加载会话..."/);
});

test("conversation body blocks composer while first page is still loading", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationBody as unknown as React.ComponentType<any>, {
      draft: "hello",
      effortOptions: ["low", "medium", "high"],
      error: null,
      hasOlderMessages: false,
      loading: true,
      loadingOlder: false,
      messages: [],
      modelOptions: [
        {
          id: "gpt-5-codex",
          displayName: "GPT-5 Codex",
          description: "default",
          isDefault: true,
          hidden: false,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium", "high"],
        },
      ],
      pendingUserInputRequests: [],
      providerSendAvailable: true,
      respondingRequestId: null,
      selectedEffort: "high",
      selectedModelId: "gpt-5-codex",
      conversationStatus: { phase: "idle", label: "就绪", tone: "neutral" } as ConversationStatus,
      sending: false,
      summary: null,
      onDraftChange: () => {},
      onLoadOlder: () => {},
      onRespondUserInput: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, /aria-label="正在加载记录\.\.\."|aria-label="正在加载记录..."/);
  assert.doesNotMatch(markup, /Message Hub-Run/);
});

test("script tool messages keep layered collapse and hide preview by default", () => {
  const markup = renderToStaticMarkup(
    React.createElement("div", {}, [
      React.createElement(ConversationMessageCard, {
        key: "tool-use",
        message: {
          id: "tool-use",
          role: "assistant",
          kind: "tool_use",
          title: "bash",
          text: "{\"command\":\"npm test\"}",
        },
      }),
      React.createElement(ConversationMessageCard, {
        key: "tool-result",
        message: {
          id: "tool-result",
          role: "assistant",
          kind: "tool_result",
          text: "tests passed\nfull output should stay collapsed by default",
        },
        previousMessage: {
          id: "tool-use",
          role: "assistant",
          kind: "tool_use",
          title: "bash",
          text: "{\"command\":\"npm test\"}",
        },
      }),
    ]),
  );

  assert.match(markup, />脚本</);
  assert.match(markup, /展开详情/);
  assert.doesNotMatch(markup, /展开结果/);
  assert.doesNotMatch(markup, /tests passed full output should stay collapsed by default/);
  assert.doesNotMatch(markup, /<pre[^>]*>tests passed\nfull output should stay collapsed by default<\/pre>/);
});

test("composer shows generating state near the send button instead of timeline banner text", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationBody as unknown as React.ComponentType<any>, {
      canInterrupt: true,
      draft: "",
      effortOptions: ["low", "medium", "high"],
      error: null,
      hasOlderMessages: false,
      loading: false,
      loadingOlder: false,
      messages: [],
      modelOptions: [
        {
          id: "gpt-5-codex",
          displayName: "GPT-5 Codex",
          description: "default",
          isDefault: true,
          hidden: false,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium", "high"],
        },
      ],
      pendingUserInputRequests: [],
      providerSendAvailable: true,
      respondingRequestId: null,
      interrupting: false,
      selectedEffort: "high",
      selectedModelId: "gpt-5-codex",
      conversationStatus: { phase: "generating", label: "正在生成...", tone: "active" } as ConversationStatus,
      sending: true,
      summary: null,
      onDraftChange: () => {},
      onLoadOlder: () => {},
      onInterrupt: () => {},
      onRespondUserInput: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, />中断</);
  assert.match(markup, /placeholder="生成中\.\.\."|placeholder="生成中..."/);
  assert.doesNotMatch(markup, /Codex 已接受，正在生成\.\.\./);
});

test("composer shows task completion placeholder after the current turn finishes", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationBody as unknown as React.ComponentType<any>, {
      canInterrupt: false,
      draft: "",
      effortOptions: ["low", "medium", "high"],
      error: null,
      hasOlderMessages: false,
      loading: false,
      loadingOlder: false,
      messages: [],
      modelOptions: [
        {
          id: "gpt-5-codex",
          displayName: "GPT-5 Codex",
          description: "default",
          isDefault: true,
          hidden: false,
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: ["low", "medium", "high"],
        },
      ],
      pendingUserInputRequests: [],
      providerSendAvailable: true,
      respondingRequestId: null,
      interrupting: false,
      selectedEffort: "high",
      selectedModelId: "gpt-5-codex",
      conversationStatus: { phase: "completed", label: "当前回合已完成", tone: "success" } as ConversationStatus,
      sending: false,
      summary: null,
      onDraftChange: () => {},
      onLoadOlder: () => {},
      onInterrupt: () => {},
      onRespondUserInput: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, /placeholder="任务完成"/);
  assert.doesNotMatch(markup, />中断</);
});

test("thinking message renders as a dedicated reasoning block", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "thinking-1",
        role: "assistant",
        kind: "thinking",
        text: "先确认数据库连接是否超时。",
      },
    }),
  );

  assert.match(markup, />思考</);
  assert.match(markup, /assistant reasoning/);
});
