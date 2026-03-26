import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "../api/types";
import {
  resolveInitialSelectedSessionId,
  resolvePreferredSessionForProject,
} from "../web/browser-state";

const PREFERRED_SESSION: SessionSummary = {
  id: "session-9",
  display: "恢复到上次会话",
  timestamp: 1770000000000,
  project: "/workspace/app",
  projectName: "app",
};

test("resolveInitialSelectedSessionId prefers stored preferred session even when it is not first", () => {
  const sessions: SessionSummary[] = [
    {
      ...PREFERRED_SESSION,
      id: "session-10",
      timestamp: PREFERRED_SESSION.timestamp + 1000,
    },
    PREFERRED_SESSION,
  ];

  assert.equal(
    resolveInitialSelectedSessionId(sessions, null, PREFERRED_SESSION),
    PREFERRED_SESSION.id,
  );
});

test("resolveInitialSelectedSessionId still prefers explicit preferred session id", () => {
  const sessions: SessionSummary[] = [
    {
      ...PREFERRED_SESSION,
      id: "session-10",
      timestamp: PREFERRED_SESSION.timestamp + 1000,
    },
    PREFERRED_SESSION,
  ];

  assert.equal(
    resolveInitialSelectedSessionId(sessions, "session-10", PREFERRED_SESSION),
    "session-10",
  );
});

test("resolvePreferredSessionForProject ignores a preferred session from another project", () => {
  assert.equal(
    resolvePreferredSessionForProject(PREFERRED_SESSION, "/workspace/other"),
    null,
  );
});
