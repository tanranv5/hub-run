import test from "node:test";
import assert from "node:assert/strict";
import type { ConversationMessage } from "../api/types";
import {
  getToolLabel,
  resolveToolTitle,
  sanitizeConversationText,
  summarizeToolText,
} from "../web/conversation-message-helpers";

const TOOL_USE: ConversationMessage = {
  id: "tool-use-1",
  role: "assistant",
  kind: "tool_use",
  title: "bash",
  text: "{\"command\":\"npm test\"}",
};

test("tool label maps bash style messages to 脚本", () => {
  assert.equal(getToolLabel("bash"), "脚本");
});

test("tool result inherits tool title from previous tool_use message", () => {
  const toolResult: ConversationMessage = {
    id: "tool-result-1",
    role: "assistant",
    kind: "tool_result",
    text: "tests passed",
  };

  assert.equal(resolveToolTitle(toolResult, TOOL_USE), "bash");
});

test("tool result preview collapses long output into one summary line", () => {
  const preview = summarizeToolText(
    "line1\nline2\nline3 with more content to verify the collapse summary keeps only a short preview instead of the whole output block",
  );

  assert.match(preview, /^line1 line2 line3/);
  assert.match(preview, /\.\.\.$/);
});

test("sanitize conversation text removes codex IDE scaffolding and keeps the real request", () => {
  const text = sanitizeConversationText(
    "<user_instructions>\nAGENTS.md - 全局配置模板\n请始终使用中文回答\n</user_instructions>\n" +
      "<environment_context>\n<cwd>/Users/tanran/aiCode/jetra</cwd>\n</environment_context>\n" +
      "# Context from my IDE setup:\n" +
      "## Active file: index.html\n" +
      "## Open tabs:\n" +
      "- index.html: index.html\n" +
      "## My request for Codex:\n" +
      "把这个网站https://ckey.run/用curl下载下来到当前目录，要完整的哦。",
  );

  assert.equal(
    text,
    "把这个网站https://ckey.run/用curl下载下来到当前目录，要完整的哦。",
  );
});

test("sanitize conversation text returns empty when only noise remains", () => {
  const text = sanitizeConversationText(
    "<user_instructions>\nAGENTS.md - 全局配置模板\n请始终使用中文回答\n</user_instructions>",
  );

  assert.equal(text, "");
});

test("sanitize conversation text removes trailing oai memory citation block", () => {
  const text = sanitizeConversationText(
    "已按 codex-run 的逻辑修好了。\n\n" +
      "<oai-mem-citation>\n" +
      "<citation_entries>\n" +
      "MEMORY.md:1-2|note=[demo]\n" +
      "</citation_entries>\n" +
      "<rollout_ids>\n" +
      "019cd12a-1414-7e31-b3ad-f90790be3db0\n" +
      "</rollout_ids>\n" +
      "</oai-mem-citation>",
  );

  assert.equal(text, "已按 codex-run 的逻辑修好了。");
});
