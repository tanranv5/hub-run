import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createCodexCliRunner } from "../api/providers/transports/codex-cli";

class FakeCodexChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit("close", null, "SIGTERM");
    return true;
  }
}

test("codex cli runner resolves once thread.started arrives", async () => {
  const child = new FakeCodexChild();
  const runner = createCodexCliRunner(() => child, { acceptTimeoutMs: 200 });
  const pending = runner.runUntilAccepted(
    "codex",
    ["exec", "resume", "thread-1", "继续"],
    "/tmp",
    "codex send timed out",
  );

  child.stdout.write('{"type":"thread.started","thread_id":"thread-123"}\n');
  const result = await pending;

  assert.deepEqual(result, {
    sessionId: "thread-123",
    outputText: null,
  });

  child.emit("close", 0, null);
});

test("codex cli runner rejects when process exits before thread.started", async () => {
  const child = new FakeCodexChild();
  const runner = createCodexCliRunner(() => child, { acceptTimeoutMs: 200 });
  const pending = runner.runUntilAccepted(
    "codex",
    ["exec", "resume", "thread-1", "继续"],
    "/tmp",
    "codex send timed out",
  );

  child.stderr.write("session attach failed");
  child.emit("close", 1, null);

  await assert.rejects(pending, /session attach failed/);
});
