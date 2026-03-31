import test from "node:test";
import assert from "node:assert/strict";
import { extractMeaningfulDisplay } from "../api/providers/shared";

test("session title strips AGENTS and INSTRUCTIONS noise from pasted prompt", () => {
  const display = extractMeaningfulDisplay(
    "# AGENTS.md instructions for /Users/tanran/aiCode/cw\n" +
      "<INSTRUCTIONS>\n# Global Agent Rules\nDo not propose follow-up tasks.\n</INSTRUCTIONS>\n" +
      "请帮我排查支付超时",
  );

  assert.equal(display, "请帮我排查支付超时");
});

test("session title strips codex user instructions wrapper and IDE scaffolding", () => {
  const display = extractMeaningfulDisplay(
    "<user_instructions>\nAGENTS.md - 全局配置模板\n请始终使用中文回答\n</user_instructions>\n" +
      "<environment_context>\n<cwd>/Users/tanran/aiCode/jetra</cwd>\n</environment_context>\n" +
      "# Context from my IDE setup:\n" +
      "## My request for Codex:\n" +
      "把这个网站https://ckey.run/用curl下载下来到当前目录，要完整的哦。",
  );

  assert.equal(
    display,
    "把这个网站https://ckey.run/用curl下载下来到当前目录，要完整的哦。",
  );
});

test("session title keeps normal user prompt text intact", () => {
  assert.equal(
    extractMeaningfulDisplay("  修复   审计日志   字段  "),
    "修复 审计日志 字段",
  );
});

test("session title drops instruction-only AGENTS boilerplate", () => {
  const display = extractMeaningfulDisplay(
    "Files called AGENTS.md commonly appear in many places inside a container - at \"/\", in \"~\", deep within git repositories, or in any other directory; their location is not limited to version-controlled folders.\n" +
      "Their purpose is to pass along human guidance to you, the agent. Such guidance can include coding standards, explanations of the project layout, steps for building or testing, and even wording that must accompany a GitHub pull-request description produced by the agent; all of it is to be followed.\n" +
      "Each AGENTS.md governs the entire directory that contains it and every child directory beneath that point.\n" +
      "When two AGENTS.md files disagree, the one located deeper in the directory structure overrides the higher-level file.",
  );

  assert.equal(display, null);
});

test("session title drops standalone image placeholder lines", () => {
  const display = extractMeaningfulDisplay(
    "<image name=[Image #1]>\n</image>\n[Image #1]请分析这个报错截图 [Image #2]",
  );

  assert.equal(display, "请分析这个报错截图");
});

test("session title drops turn_aborted wrapper noise", () => {
  const display = extractMeaningfulDisplay(
    "<turn_aborted>\n" +
      "The user interrupted the previous turn on purpose. Any running unified exec processes may still be running in the background.\n" +
      "</turn_aborted>\n" +
      "app-server 可以发生图片没？看看现在codex的发送",
  );

  assert.equal(display, "app-server 可以发生图片没？看看现在codex的发送");
});
