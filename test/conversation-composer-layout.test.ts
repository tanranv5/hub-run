import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ConversationComposer from "../web/components/conversation-composer";
import { ConversationMessageCard } from "../web/components/conversation-message";
import type { ConversationStatus } from "../web/conversation-status";

Object.assign(globalThis, { React });

const IDLE_STATUS: ConversationStatus = { phase: "idle", label: "就绪", tone: "neutral" };

test("composer keeps model and effort on one row and shows compact usage badge", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationComposer, {
      contextDetails: "211213/258400",
      contextLabel: "81%",
      conversationStatus: IDLE_STATUS,
      draft: "",
      effortOptions: ["medium", "high"],
      modelOptions: [
        {
          id: "gpt-5.4",
          displayName: "GPT-5.4",
          description: "",
          isDefault: true,
          hidden: false,
          defaultReasoningEffort: "high",
          supportedReasoningEfforts: ["medium", "high"],
        },
      ],
      selectedEffort: "high",
      selectedModelId: "gpt-5.4",
      sending: false,
      voicePhase: "idle",
      onDraftChange: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, /data-slot="conversation-context-badge"/);
  assert.match(markup, />81%</);
  assert.match(markup, /211213\/258400/);
  assert.match(markup, /bottom-3 left-3/);
  assert.match(markup, /data-slot="composer-controls"/);
  assert.match(markup, /data-slot="composer-actions"/);
  assert.doesNotMatch(markup, /flex-wrap/);
  assert.match(markup, /grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,0\.9fr\)\]/);
  assert.match(markup, /justify-end/);
  assert.match(markup, /placeholder="等待输入"/);
  assert.doesNotMatch(markup, />生成中</);
  assert.doesNotMatch(markup, /语音输入待接入/);
  assert.match(markup, /title="开始语音输入"/);
});

test("message content uses a smaller mobile font to fit more history", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationMessageCard, {
      message: {
        id: "assistant-1",
        role: "assistant",
        kind: "text",
        text: "这条消息在手机上应该更紧凑。",
      },
    }),
  );

  assert.match(markup, /text-\[12px\]/);
  assert.match(markup, /md:text-\[13px\]/);
});

test("composer shows existing draft plus live voice text inside the textarea while recording", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationComposer, {
      contextDetails: "211213/258400",
      contextLabel: "81%",
      conversationStatus: IDLE_STATUS,
      draft: "先保留这句\n上海今天下雨吗",
      effortOptions: ["medium", "high"],
      modelOptions: [
        {
          id: "gpt-5.4",
          displayName: "GPT-5.4",
          description: "",
          isDefault: true,
          hidden: false,
          defaultReasoningEffort: "high",
          supportedReasoningEfforts: ["medium", "high"],
        },
      ],
      selectedEffort: "high",
      selectedModelId: "gpt-5.4",
      sending: false,
      voicePhase: "recording",
      onDraftChange: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, /<textarea[^>]*>先保留这句\n上海今天下雨吗<\/textarea>/);
  assert.doesNotMatch(markup, /data-slot="voice-transcript"/);
});
