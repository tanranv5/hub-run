import test from "node:test";
import assert from "node:assert/strict";
import { createClaudeProvider } from "../api/providers/sources/claude";

test("claude provider supports draft-first create flow like codex", () => {
  const provider = createClaudeProvider("/tmp/hub-run-missing-claude-root");

  assert.equal(provider.canCreateSession, true);
  assert.equal(provider.supportsEmptyCreateSession, false);
  assert.equal(typeof provider.createSession, "function");
  assert.equal(typeof provider.deleteSession, "function");
});
