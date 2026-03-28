import test from "node:test";
import assert from "node:assert/strict";
import type { SessionSummary } from "../api/types";
import * as sessionBrowserStateModule from "../web/session-browser-state";
import {
  buildResumeCommand,
  getProjectLabel,
  getSessionTitle,
  matchesSessionFilter,
  resolveSelectedProject,
} from "../web/session-browser-state";

const SESSION: SessionSummary = {
  id: "session-1",
  display: "Investigate layout regression",
  timestamp: 1770000000000,
  project: "/Users/tanran/aiCode/cw/hub-run",
  projectName: "hub-run",
};

test("project label keeps the full project path", () => {
  assert.equal(getProjectLabel(SESSION.project), SESSION.project);
});

test("session filter matches full project path search", () => {
  assert.equal(
    matchesSessionFilter(SESSION, null, "/Users/tanran/aiCode/cw"),
    true,
  );
});

test("session title normalizes whitespace and truncates long prompts", () => {
  assert.equal(
    getSessionTitle(
      "ai软着，需要心理ai方面的源代码，是10号字70度斜体排版验证用超长标题",
    ),
    "ai软着，需要心理ai方面的源代码，是10号字70度斜体排版...",
  );
});

test("session title falls back to unnamed when display is empty", () => {
  assert.equal(getSessionTitle("   "), "未命名会话");
});

test("session title falls back to unnamed for placeholder-only displays", () => {
  assert.equal(getSessionTitle("(no prompt text)"), "未命名会话");
  assert.equal(getSessionTitle("(empty)"), "未命名会话");
  assert.equal(getSessionTitle("<image name=[Image #1]>"), "未命名会话");
  assert.equal(getSessionTitle("</image>"), "未命名会话");
});

test("resume command uses provider specific cli command", () => {
  assert.equal(
    buildResumeCommand("codex", "session-1", "/Users/tanran/aiCode/cw"),
    "cd /Users/tanran/aiCode/cw && codex resume session-1",
  );
  assert.equal(
    buildResumeCommand("claude", "session-2", "/Users/tanran/aiCode/cw"),
    "cd /Users/tanran/aiCode/cw && claude --resume session-2",
  );
});

test("selected project only resolves on exact project path match", () => {
  const projects = [
    "/Users/tanran/.claude",
    "/Users/tanran/aiCode/cw",
  ];

  assert.equal(resolveSelectedProject(projects, "/Users/tanran/.clau"), null);
  assert.equal(resolveSelectedProject(projects, "/Users/tanran/.claude"), "/Users/tanran/.claude");
});

test("virtual window math keeps only visible rows plus overscan", () => {
  const computeVirtualWindow = (
    sessionBrowserStateModule as Record<string, unknown>
  ).computeVirtualWindow;

  assert.equal(typeof computeVirtualWindow, "function");
  assert.deepEqual(
    (computeVirtualWindow as (input: unknown) => unknown)({
      itemCount: 200,
      itemHeight: 76,
      containerHeight: 304,
      overscan: 2,
      scrollTop: 760,
    }),
    {
      startIndex: 8,
      endIndex: 16,
      paddingTop: 608,
      paddingBottom: 13984,
    },
  );
});

test("selected row scroll target reveals an item outside the current viewport", () => {
  const getScrollTopToRevealIndex = (
    sessionBrowserStateModule as Record<string, unknown>
  ).getScrollTopToRevealIndex;

  assert.equal(typeof getScrollTopToRevealIndex, "function");
  assert.equal(
    (getScrollTopToRevealIndex as (input: unknown) => unknown)({
      currentScrollTop: 0,
      containerHeight: 304,
      itemHeight: 76,
      index: 12,
    }),
    684,
  );
});
