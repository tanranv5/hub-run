import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "../api/types";
import {
  createDraftSession,
  insertDraftSession,
  isDraftSession,
} from "../web/draft-session";

const EXISTING_SESSION: SessionSummary = {
  id: "session-1",
  display: "既有会话",
  timestamp: 1770000000000,
  project: "/Users/tanran/aiCode/cw/hub-run",
  projectName: "hub-run",
};

test("createDraftSession marks placeholder session for local-only creation", () => {
  const session = createDraftSession(
    "/Users/tanran/aiCode/cw/hub-run",
    1771000000000,
  );

  assert.equal(session.id.startsWith("draft:"), true);
  assert.equal(session.display, "新会话");
  assert.equal(session.projectName, "hub-run");
  assert.equal(session.isDraft, true);
  assert.equal(isDraftSession(session), true);
});

test("insertDraftSession prepends placeholder and keeps other sessions", () => {
  const draft = createDraftSession(
    "/Users/tanran/aiCode/cw/hub-run",
    1771000000000,
  );

  const sessions = insertDraftSession([EXISTING_SESSION], draft);
  assert.equal(sessions[0]?.id, draft.id);
  assert.equal(sessions[1]?.id, EXISTING_SESSION.id);
});
