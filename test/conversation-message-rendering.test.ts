import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProviderSummary } from "../api/types";
import {
  ConversationMessageCard,
  EmptyConversationState,
} from "../web/components/conversation-message";

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

test("user message card strips codex scaffolding and keeps only real request text", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "user-1",
        role: "user",
        kind: "text",
        text:
          "<user_instructions>\nAGENTS.md - 全局配置模板\n请始终使用中文回答\n</user_instructions>\n" +
          "<environment_context>\n<cwd>/Users/tanran/aiCode/jetra</cwd>\n</environment_context>\n" +
          "# Context from my IDE setup:\n" +
          "## My request for Codex:\n" +
          "把这个网站https://ckey.run/用curl下载下来到当前目录，要完整的哦。",
      },
    }),
  );

  assert.match(
    markup,
    /把这个网站https:\/\/ckey\.run\/用curl下载下来到当前目录，要完整的哦。/,
  );
  assert.doesNotMatch(markup, /user_instructions|environment_context/);
  assert.doesNotMatch(markup, /Context from my IDE setup|My request for Codex/);
});

test("thinking message stays collapsed by default like claude-run", () => {
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
  assert.match(markup, /展开思考/);
  assert.doesNotMatch(markup, /先确认数据库连接是否超时。/);
  assert.doesNotMatch(markup, /<pre/);
});

test("image message renders an image bubble instead of plain placeholder text", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "image-1",
        role: "user",
        kind: "image",
        text: "",
        block: {
          type: "image",
          imageUrl: "data:image/png;base64,AAAA",
        },
      },
    }),
  );

  assert.match(markup, /<img/);
  assert.match(markup, /data:image\/png;base64,AAAA/);
  assert.doesNotMatch(markup, /<pre/);
});

test("skill invocation message stays collapsed by default", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "skill-1",
        role: "system",
        kind: "text",
        text:
          "<skill>\n" +
          "  <name>taskmaster</name>\n" +
          "  <path>/Users/tanran/.codex/skills/taskmaster/SKILL.md</path>\n" +
          "</skill>",
      },
    }),
  );

  assert.match(markup, />技能</);
  assert.match(markup, /taskmaster/);
  assert.match(markup, /展开详情/);
  assert.doesNotMatch(markup, /&lt;skill&gt;|<skill>/);
  assert.doesNotMatch(markup, /SKILL\.md/);
  assert.doesNotMatch(markup, /<pre/);
});

test("skill header stays collapsed while the trailing user request remains visible", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "skill-user-1",
        role: "user",
        kind: "text",
        text:
          "<skill>\n" +
          "  <name>taskmaster</name>\n" +
          "  <path>/Users/tanran/.codex/skills/taskmaster/SKILL.md</path> 这种消息的也做成卡片折叠下",
      },
    }),
  );

  assert.match(markup, />技能</);
  assert.match(markup, /taskmaster/);
  assert.match(markup, /这种消息的也做成卡片折叠下/);
  assert.doesNotMatch(markup, /SKILL\.md/);
  assert.doesNotMatch(markup, /&lt;skill&gt;|<skill>/);
});

test("wrapped skill block keeps embedded skill body collapsed by default", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "skill-wrapped-1",
        role: "user",
        kind: "text",
        text:
          "<skill>\n" +
          "<name>taskmaster</name>\n" +
          "<path>/Users/tanran/.codex/skills/taskmaster/SKILL.md</path>\n" +
          "---\n" +
          "name: taskmaster\n" +
          "description: Unified task tracking protocol\n\n" +
          "```csv\n" +
          "id,task,status\n" +
          "1,Locate root cause,DONE\n" +
          "```\n" +
          "</skill>",
      },
    }),
  );

  assert.match(markup, />技能</);
  assert.match(markup, /taskmaster/);
  assert.match(markup, /展开详情/);
  assert.doesNotMatch(markup, /id,task,status/);
  assert.doesNotMatch(markup, /Unified task tracking protocol/);
  assert.doesNotMatch(markup, /SKILL\.md/);
  assert.doesNotMatch(markup, /&lt;skill&gt;|<skill>/);
});

test("wrapped tagged status message stays collapsed by default", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "tagged-status-1",
        role: "system",
        kind: "text",
        text:
          "<turn_aborted>\n" +
          "The user interrupted the previous turn on purpose. " +
          "Any running unified exec processes may still be running in the background.\n" +
          "</turn_aborted>",
      },
    }),
  );

  assert.match(markup, /展开详情/);
  assert.doesNotMatch(markup, /The user interrupted the previous turn on purpose/);
  assert.doesNotMatch(markup, /&lt;turn_aborted&gt;|<turn_aborted>/);
});

test("subagent notification message stays collapsed by default", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "subagent-1",
        role: "user",
        kind: "text",
        text:
          "<subagent_notification>\n" +
          "{\"agent_id\":\"019d0e78-5330-7e73-83d6-66ac63a6eaf1\",\"status\":{\"completed\":\"现有 `npm test` 156/156 通过，但基于已检查代码，仍有以下明确 findings。\"}}\n" +
          "</subagent_notification>",
      },
    }),
  );

  assert.match(markup, />子代理</);
  assert.match(markup, /已完成/);
  assert.match(markup, /展开详情/);
  assert.doesNotMatch(markup, /&lt;subagent_notification&gt;|<subagent_notification>/);
  assert.doesNotMatch(markup, /npm test 156\/156 通过/);
  assert.doesNotMatch(markup, /agent_id/);
});

test("subagent notification header stays collapsed while trailing user text remains visible", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "subagent-user-1",
        role: "user",
        kind: "text",
        text: "<subagent_notification> 这个也折叠起来。还有状态又监控不到了。",
      },
    }),
  );

  assert.match(markup, />子代理</);
  assert.match(markup, /通知/);
  assert.match(markup, /这个也折叠起来。还有状态又监控不到了。/);
  assert.doesNotMatch(markup, /&lt;subagent_notification&gt;|<subagent_notification>/);
});

test("script tool use keeps title-only by default with layered collapse", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "tool-use-1",
        role: "assistant",
        kind: "tool_use",
        title: "bash",
        text: "{\"command\":\"cd /Users/tanran/aiCode/jetra && curl -L https://ckey.run/ -o index.html\"}",
      },
    }),
  );

  assert.match(markup, />脚本</);
  assert.match(markup, /展开详情/);
  assert.doesNotMatch(markup, /展开输入/);
  assert.doesNotMatch(markup, /curl -L https:\/\/ckey\.run\/ -o index\.html/);
  assert.doesNotMatch(markup, /<pre/);
});

test("assistant message card hides trailing oai memory citation block", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "assistant-1",
        role: "assistant",
        kind: "text",
        text:
          "已按 codex-run 的逻辑修好了。\n\n" +
          "<oai-mem-citation>\n" +
          "<citation_entries>\n" +
          "MEMORY.md:1-2|note=[demo]\n" +
          "</citation_entries>\n" +
          "<rollout_ids>\n" +
          "019cd12a-1414-7e31-b3ad-f90790be3db0\n" +
          "</rollout_ids>\n" +
          "</oai-mem-citation>",
      },
    }),
  );

  assert.match(markup, /已按 codex-run 的逻辑修好了。/);
  assert.doesNotMatch(markup, /oai-mem-citation|citation_entries|rollout_ids/);
});

test("assistant markdown block renders rich markdown instead of plain pre text", () => {
  const content = "## 检查清单\n- 第一项\n- 第二项\n\n```ts\nconst ready = true;\n```";
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "assistant-markdown-1",
        role: "assistant",
        kind: "text",
        text: content,
        block: {
          type: "text",
          text: content,
        },
      } as any,
    }),
  );

  assert.match(markup, /<ul/);
  assert.match(markup, /<code/);
  assert.doesNotMatch(markup, /<pre/);
});

test("assistant plain text bubble can stretch to full width on desktop", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "assistant-wide-1",
        role: "assistant",
        kind: "text",
        text: "这是一条需要铺满剩余宽度的普通助手消息。",
      },
    }),
  );

  assert.match(markup, /mr-auto max-w-full/);
  assert.doesNotMatch(markup, /md:max-w-\[78%\]/);
});

test("empty conversation state keeps a fixed-height composer shell at the bottom", () => {
  const markup = renderToStaticMarkup(
    React.createElement(EmptyConversationState, {
      provider: PROVIDER,
      onOpenBrowser: () => {},
    }),
  );

  assert.match(markup, /data-slot="empty-conversation-state"/);
  assert.match(markup, /data-slot="empty-conversation-composer-shell"/);
  assert.match(markup, /flex-none p-3 md:p-5/);
  assert.match(markup, /min-h-\[128px\]/);
  assert.match(markup, /flex flex-1 flex-col px-6 pt-6/);
  assert.doesNotMatch(markup, /flex flex-1 items-center justify-center p-6/);
  assert.match(markup, /flex min-h-0 w-full flex-1 flex-col items-center justify-center/);
  assert.doesNotMatch(markup, /w-full flex-none flex-col items-center justify-center/);
});

test("assistant message card shows exact timestamp in bottom-right metadata", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "assistant-time-1",
        role: "assistant",
        kind: "text",
        text: "这条消息已经真正写入会话记录。",
        timestamp: "2026-03-20T11:14:25.000Z",
      },
    }),
  );

  assert.match(markup, /19:14:25/);
  assert.match(markup, /data-slot="message-timestamp"/);
});

test("turn aborted message renders as a dedicated interrupted card", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "aborted-1",
        role: "system",
        kind: "turn_aborted",
        title: "status",
        text: "当前轮次已中断（interrupt_requested）。",
        block: {
          type: "turn_aborted",
          text: "当前轮次已中断（interrupt_requested）。",
          title: "status",
        },
      } as any,
    }),
  );

  assert.match(markup, /已中断/);
  assert.match(markup, /展开详情/);
  assert.doesNotMatch(markup, /User|Assistant/);
});

test("request user input tool card exposes compact question count preview", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "tool-user-input-1",
        role: "assistant",
        kind: "tool_use",
        title: "request_user_input",
        text: "{\"questions\":[{\"header\":\"继续执行\",\"question\":\"请选择下一步\",\"options\":[{\"label\":\"继续\",\"description\":\"批准继续执行\"}]}]}",
        block: {
          type: "tool_use",
          name: "request_user_input",
          input: {
            questions: [
              {
                header: "继续执行",
                question: "请选择下一步",
                options: [
                  {
                    label: "继续",
                    description: "批准继续执行",
                  },
                ],
              },
            ],
          },
        },
      } as any,
    }),
  );

  assert.match(markup, /1 question\(s\)/);
  assert.match(markup, /展开输入/);
});

test("tool card also shows exact timestamp in bottom-right metadata", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "tool-timestamp-1",
        role: "assistant",
        kind: "tool_result",
        title: "bash",
        text: "tests passed",
        timestamp: "2026-03-20T11:15:26.000Z",
      },
      previousMessage: {
        id: "tool-use-1",
        role: "assistant",
        kind: "tool_use",
        title: "bash",
        text: "{\"command\":\"npm test\"}",
        timestamp: "2026-03-20T11:15:20.000Z",
      },
    }),
  );

  assert.match(markup, /19:15:26/);
  assert.match(markup, /data-slot="message-timestamp"/);
});

test("text mode renders wrapped skill text as plain conversation text instead of a skill card", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      renderMode: "text",
      message: {
        id: "skill-text-1",
        role: "user",
        kind: "text",
        text:
          "<skill>\n" +
          "  <name>taskmaster</name>\n" +
          "  <path>/Users/tanran/.codex/skills/taskmaster/SKILL.md</path>\n" +
          "</skill>\n" +
          "这种消息在纯文本模式下只保留正文。",
      },
    }),
  );

  assert.match(markup, /这种消息在纯文本模式下只保留正文。/);
  assert.doesNotMatch(markup, />技能</);
  assert.doesNotMatch(markup, /SKILL\.md/);
});

test("active search hit adds a stronger ring and highlighted mark to the message bubble", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      highlightQuery: "alpha",
      searchState: "active",
      message: {
        id: "search-hit-1",
        role: "assistant",
        kind: "text",
        text: "alpha beta alpha",
      },
    }),
  );

  assert.match(markup, /ring-2 ring-amber-400\/80/);
  assert.match(markup, /<mark class="rounded bg-amber-400\/50 px-0\.5 text-current">alpha<\/mark>/);
});
