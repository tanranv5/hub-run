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
  assert.match(markup, /grid-cols-\[minmax\(0,1fr\)_minmax\(6\.25rem,0\.8fr\)\]/);
  assert.match(markup, />模型</);
  assert.match(markup, />思考</);
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

test("composer shows a selected image preview and image picker for codex", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationComposer, {
      conversationStatus: IDLE_STATUS,
      draft: "",
      effortOptions: ["medium", "high"],
      imageUploadEnabled: true,
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
      pendingImages: [{
        name: "error.png",
        url: "data:image/png;base64,AAAA",
      }],
      selectedEffort: "high",
      selectedModelId: "gpt-5.4",
      sending: false,
      voicePhase: "idle",
      onDraftChange: () => {},
      onPendingImagesChange: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, /data-slot="composer-image-preview"/);
  assert.match(markup, /error\.png/);
  assert.match(markup, /data:image\/png;base64,AAAA/);
  assert.match(markup, /aria-label="选择图片"/);
  assert.match(markup, /aria-label="移除图片"/);
});

test("composer exposes a resize handle and collapses to one line while browsing history", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationComposer, {
      browseCollapsed: true,
      contextDetails: "211213/258400",
      contextLabel: "81%",
      conversationStatus: IDLE_STATUS,
      draft: "这段草稿在浏览态不应该撑高输入框",
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
      storedHeight: 220,
      voicePhase: "idle",
      onDraftChange: () => {},
      onExpandFromBrowse: () => {},
      onSelectEffort: () => {},
      onSelectModel: () => {},
      onSend: () => {},
      onStoredHeightChange: () => {},
      onVoiceClick: () => {},
    }),
  );

  assert.match(markup, /data-slot="composer-resize-handle"/);
  assert.match(markup, /height:44px/);
  assert.match(markup, /overflow:hidden/);
  assert.match(markup, /inset-x-3/);
  assert.match(markup, /top-0/);
  assert.match(markup, /-translate-y-1\/2/);
  assert.match(markup, /h-5/);
  assert.doesNotMatch(markup, /bottom-12/);
  assert.doesNotMatch(markup, /left-1\/2 top-0 z-10 h-2 w-16/);
});
