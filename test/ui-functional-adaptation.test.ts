import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProviderSummary, SessionSummary } from "../api/types";
import AppHeader from "../web/components/app-header";
import AppScreen from "../web/components/app-screen";
import BrowserSidebar from "../web/components/browser-sidebar";
import ConversationPanel, { ConversationBody } from "../web/components/conversation-panel";
import { ConversationMessageCard } from "../web/components/conversation-message";
import SessionBrowser from "../web/components/session-browser";
import type { ConversationStatus } from "../web/conversation-status";

Object.assign(globalThis, { React });

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertButtonClassContains(props: {
  attribute: "aria-label" | "title";
  classFragment: string;
  markup: string;
  value: string;
}) {
  const {
    attribute,
    classFragment,
    markup,
    value,
  } = props;
  const escapedClass = escapeRegExp(classFragment);
  const escapedValue = escapeRegExp(value);
  const pattern = new RegExp(
    `<button[^>]*(?:class="[^"]*${escapedClass}[^"]*"[^>]*${attribute}="${escapedValue}"|${attribute}="${escapedValue}"[^>]*class="[^"]*${escapedClass}[^"]*")`,
  );
  assert.match(markup, pattern);
}

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
  assertButtonClassContains({
    markup,
    attribute: "aria-label",
    value: "切换主题",
    classFragment: "h-8 w-8",
  });
  assertButtonClassContains({
    markup,
    attribute: "aria-label",
    value: "打开会话面板",
    classFragment: "h-8 w-8",
  });
  assertButtonClassContains({
    markup,
    attribute: "aria-label",
    value: "刷新消息",
    classFragment: "h-8",
  });
  assertButtonClassContains({
    markup,
    attribute: "aria-label",
    value: "退出",
    classFragment: "h-8",
  });
});

test("app header shows loading state while refresh is running", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AppHeader, {
      authEnabled: true,
      provider: PROVIDER,
      providers: [PROVIDER],
      refreshing: true,
      onSelectProvider: () => {},
      onOpenBrowser: () => {},
      onRefresh: () => {},
      onLogout: () => {},
    }),
  );

  assert.match(markup, /刷新中/);
  assert.match(markup, /animate-spin/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /disabled=""/);
});

test("app refresh keeps session search editable while conversation refreshes separately", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AppScreen as unknown as React.ComponentType<any>, {
      authEnabled: true,
      bootstrapError: null,
      blockingOverlayLabel: null,
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
      contextDetails: null,
      contextLabel: null,
      controls: {
        models: [
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
        projects: [SESSION.project],
        selectedProject: SESSION.project,
        selectedModelId: "gpt-5-codex",
        selectedEffort: "high",
        newSessionCwd: SESSION.project,
        loading: false,
        creatingSession: false,
        error: null,
      },
      desktopSidebarOpen: true,
      effortOptions: ["low", "medium", "high"],
      refreshing: true,
      onCreateSession: () => {},
      onCloseSidebar: () => {},
      onLoadMore: () => {},
      onLogout: () => {},
      onMessageSent: async () => undefined,
      onNewSessionCwdChange: () => {},
      onOpenBrowser: () => {},
      onRefresh: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSelectProject: () => {},
      onSelectProvider: () => {},
      onSelectSession: () => {},
      onToggleDesktopSidebar: () => {},
      panelRefreshVersion: 1,
      provider: PROVIDER,
      providers: [PROVIDER],
      sessionCacheRef: { current: new Map() },
      selectedSession: SESSION,
      sendMessage: async () => ({ sessionId: SESSION.id, turnId: null, outputText: null }),
      sidebarOpen: false,
    }),
  );

  assert.match(markup, /aria-label="搜索会话"/);
  assert.doesNotMatch(markup, /aria-label="搜索会话"[^>]*disabled=""/);
});

test("provider switch blocks the entire app instead of only the session list", () => {
  const claudeProvider = {
    ...PROVIDER,
    id: "claude",
    label: "Claude",
    rootPath: "/Users/tanran/.claude",
  } as ProviderSummary;
  const markup = renderToStaticMarkup(
    React.createElement(AppScreen as unknown as React.ComponentType<any>, {
      authEnabled: true,
      bootstrapError: null,
      blockingOverlayDescription: "切换 Provider，页面暂时不可操作。",
      blockingOverlayLabel: "正在切换到 Claude...",
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
      contextDetails: null,
      contextLabel: null,
      controls: {
        models: [],
        projects: [SESSION.project],
        selectedProject: SESSION.project,
        selectedModelId: null,
        selectedEffort: null,
        newSessionCwd: SESSION.project,
        loading: true,
        creatingSession: false,
        error: null,
      },
      desktopSidebarOpen: true,
      effortOptions: [],
      refreshing: false,
      onCreateSession: () => {},
      onCloseSidebar: () => {},
      onLoadMore: () => {},
      onLogout: () => {},
      onMessageSent: async () => undefined,
      onNewSessionCwdChange: () => {},
      onOpenBrowser: () => {},
      onRefresh: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSelectProject: () => {},
      onSelectProvider: () => {},
      onSelectSession: () => {},
      onToggleDesktopSidebar: () => {},
      panelRefreshVersion: 1,
      provider: claudeProvider,
      providers: [PROVIDER, claudeProvider],
      sessionCacheRef: { current: new Map() },
      selectedSession: SESSION,
      sendMessage: async () => ({ sessionId: SESSION.id, turnId: null, outputText: null }),
      sidebarOpen: false,
    }),
  );

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-label="正在切换到 Claude\.\.\."|aria-label="正在切换到 Claude..."/);
  assert.match(markup, /切换 Provider，页面暂时不可操作/);
});

test("create-session overlay can show a dedicated global loading description", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AppScreen as unknown as React.ComponentType<any>, {
      authEnabled: true,
      bootstrapError: null,
      blockingOverlayDescription: "正在等待新会话首条消息出现，页面暂时不可操作。",
      blockingOverlayLabel: "正在等待新会话首条消息出现...",
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
      contextDetails: null,
      contextLabel: null,
      controls: {
        models: [],
        projects: [SESSION.project],
        selectedProject: SESSION.project,
        selectedModelId: null,
        selectedEffort: null,
        newSessionCwd: SESSION.project,
        loading: false,
        creatingSession: false,
        error: null,
      },
      desktopSidebarOpen: true,
      effortOptions: [],
      refreshing: false,
      onCreateSession: () => {},
      onCloseSidebar: () => {},
      onLoadMore: () => {},
      onLogout: () => {},
      onMessageSent: async () => undefined,
      onNewSessionCwdChange: () => {},
      onOpenBrowser: () => {},
      onRefresh: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSelectProject: () => {},
      onSelectProvider: () => {},
      onSelectSession: () => {},
      onToggleDesktopSidebar: () => {},
      panelRefreshVersion: 1,
      provider: PROVIDER,
      providers: [PROVIDER],
      sessionCacheRef: { current: new Map() },
      selectedSession: SESSION,
      sendMessage: async () => ({ sessionId: SESSION.id, turnId: null, outputText: null }),
      sidebarOpen: false,
    }),
  );

  assert.match(markup, /aria-label="正在等待新会话首条消息出现\.\.\."|aria-label="正在等待新会话首条消息出现..."/);
  assert.match(markup, /正在等待新会话首条消息出现，页面暂时不可操作/);
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
  assert.match(markup, /justify-end/);
  assert.match(markup, /gap-1\.5 md:gap-2/);
  assert.match(markup, /ai软着，需要心理ai方面的源代码，是10号字70度斜体排版/);
  assert.match(markup, /hub-run/);
  assert.match(markup, /min-h-0 flex-1 flex-col/);
  assert.match(markup, /h-full overflow-y-auto/);
  assert.match(markup, /placeholder="加载中\.\.\."/);
  assert.doesNotMatch(markup, /Message Hub-Run/);
  assertButtonClassContains({
    markup,
    attribute: "title",
    value: "开始语音输入",
    classFragment: "h-8 w-8",
  });
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
      totalSessionCount: 24,
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

  assert.match(markup, /24 条会话/);
  assert.match(markup, /项目路径/);
  assert.match(markup, /aria-label="展开项目列表"/);
  assert.doesNotMatch(markup, /<datalist/);
  assert.match(markup, /aria-label="新建会话"/);
  assert.doesNotMatch(markup, />新建会话</);
  assert.match(markup, /ai软着，需要心理ai方面的源代码，是10号字70度斜体排版/);
  assertButtonClassContains({
    markup,
    attribute: "aria-label",
    value: "展开项目列表",
    classFragment: "h-8 w-8",
  });
  assertButtonClassContains({
    markup,
    attribute: "aria-label",
    value: "新建会话",
    classFragment: "h-8 w-8",
  });
});

test("session browser shows inline create-session error near project path controls", () => {
  const markup = renderToStaticMarkup(
    React.createElement(SessionBrowser as unknown as React.ComponentType<any>, {
      provider: PROVIDER,
      projects: [SESSION.project],
      sessions: [SESSION],
      totalSessionCount: 1,
      nextBefore: null,
      loading: false,
      loadingMore: false,
      errorMessage: "项目路径不能为空",
      selectedProject: null,
      selectedSessionId: SESSION.id,
      newSessionCwd: "",
      creatingSession: false,
      onNewSessionCwdChange: () => {},
      onCreateSession: () => {},
      onLoadMore: () => {},
      onSelectProject: () => {},
      onSelectSession: () => {},
    }),
  );

  assert.match(markup, /项目路径/);
  assert.match(markup, /项目路径不能为空/);
  assert.match(markup, /aria-live="polite"/);
});

test("create-session button stays pinned to the top when path hints expand the field", () => {
  const markup = renderToStaticMarkup(
    React.createElement(SessionBrowser as unknown as React.ComponentType<any>, {
      provider: PROVIDER,
      projects: [SESSION.project],
      sessions: [SESSION],
      totalSessionCount: 1,
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

  assertButtonClassContains({
    markup,
    attribute: "aria-label",
    value: "新建会话",
    classFragment: "self-start",
  });
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

test("app screen keeps control errors inside the sidebar instead of the global left banner", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AppScreen as unknown as React.ComponentType<any>, {
      authEnabled: true,
      bootstrapError: null,
      blockingOverlayLabel: null,
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
        error: null,
      },
      contextDetails: null,
      contextLabel: null,
      controls: {
        models: [
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
        projects: [SESSION.project],
        selectedProject: null,
        selectedModelId: "gpt-5-codex",
        selectedEffort: "high",
        newSessionCwd: "",
        loading: false,
        creatingSession: false,
        error: "项目路径不能为空",
      },
      desktopSidebarOpen: true,
      effortOptions: ["low", "medium", "high"],
      refreshing: false,
      onCreateSession: () => {},
      onCloseSidebar: () => {},
      onLoadMore: () => {},
      onLogout: () => {},
      onMessageSent: async () => undefined,
      onNewSessionCwdChange: () => {},
      onOpenBrowser: () => {},
      onRefresh: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSelectProject: () => {},
      onSelectProvider: () => {},
      onSelectSession: () => {},
      onToggleDesktopSidebar: () => {},
      panelRefreshVersion: 1,
      provider: PROVIDER,
      providers: [PROVIDER],
      sessionCacheRef: { current: new Map() },
      selectedSession: SESSION,
      sendMessage: async () => ({ sessionId: SESSION.id, turnId: null, outputText: null }),
      sidebarOpen: false,
    }),
  );

  assert.match(markup, /项目路径不能为空/);
  assert.doesNotMatch(markup, /rounded-2xl border border-rose-400\/20 bg-rose-500\/10/);
  assert.match(markup, /aria-live="polite"/);
});

test("mobile browser sidebar shell uses theme colors instead of hard-coded dark classes", () => {
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
      open: true,
      desktopOpen: false,
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

  assert.doesNotMatch(markup, /bg-\[#08101d\]/);
  assert.doesNotMatch(markup, /border-white\/10/);
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

test("session browser disables editing controls while refresh is running", () => {
  const markup = renderToStaticMarkup(
    React.createElement(SessionBrowser as unknown as React.ComponentType<any>, {
      provider: PROVIDER,
      projects: [SESSION.project],
      sessions: [SESSION],
      totalSessionCount: 1,
      nextBefore: "cursor-1",
      loading: false,
      loadingMore: false,
      refreshing: true,
      selectedProject: SESSION.project,
      selectedSessionId: SESSION.id,
      newSessionCwd: SESSION.project,
      creatingSession: false,
      onNewSessionCwdChange: () => {},
      onCreateSession: () => {},
      onLoadMore: () => {},
      onSelectProject: () => {},
      onSelectSession: () => {},
    }),
  );

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /title="刷新中\.\.\."|title="刷新中..."/);
  assert.match(markup, /aria-label="搜索会话"/);
  assert.match(markup, /加载更多历史/);
  assert.match(markup, /disabled=""/);
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

  assert.match(markup, /aria-label="中断当前回合"/);
  assert.doesNotMatch(markup, />中断</);
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
  assert.doesNotMatch(markup, /aria-label="中断当前回合"/);
  assert.doesNotMatch(markup, />中断</);
});

test("conversation body shows a loading overlay while refresh is running", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationBody as unknown as React.ComponentType<any>, {
      canInterrupt: false,
      draft: "刷新时不要继续编辑",
      effortOptions: ["low", "medium", "high"],
      error: null,
      hasOlderMessages: false,
      hasBufferedLatest: false,
      loading: false,
      loadingOlder: false,
      messageWindowFrozen: false,
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
      refreshing: true,
      respondingRequestId: null,
      interrupting: false,
      selectedEffort: "high",
      selectedModelId: "gpt-5-codex",
      conversationStatus: { phase: "idle", label: "就绪", tone: "neutral" } as ConversationStatus,
      sending: false,
      summary: null,
      onDraftChange: () => {},
      onLoadOlder: () => {},
      onInterrupt: () => {},
      onMessageWindowFrozenChange: () => {},
      onRespondUserInput: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onViewLatest: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-label="正在刷新当前会话\.\.\."|aria-label="正在刷新当前会话..."/);
  assert.match(markup, /刷新中，正在重新拉取当前会话\.\.\./);
  assert.match(markup, /placeholder="刷新中，暂时不可编辑"/);
  assert.match(markup, /aria-label="发送消息"/);
  assert.match(markup, /disabled=""/);
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
