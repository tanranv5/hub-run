import assert from "node:assert/strict";
import { chmodSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { sendClaudeMessage } from "../api/providers/transports/claude-cli";

const FAKE_CLAUDE_PATH = resolve(
  "/Users/tanran/aiCode/cw/hub-run/test/fixtures/fake-claude-cli.mjs",
);
const PID_WAIT_TIMEOUT_MS = 200;
const SETTLE_TIMEOUT_MS = 400;
const EXIT_TIMEOUT_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readPid(pidPath: string) {
  const raw = await readFile(pidPath, "utf-8");
  return Number.parseInt(raw.trim(), 10);
}

async function waitForPidFile(pidPath: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await readPid(pidPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
      await delay(20);
    }
  }
  return null;
}

async function waitForProcessExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await delay(25);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        return;
      }
      throw error;
    }
  }
  throw new Error(`process ${pid} did not exit within ${timeoutMs}ms`);
}

test("claude send times out promptly and force-kills a CLI that ignores SIGTERM", async (t) => {
  chmodSync(FAKE_CLAUDE_PATH, 0o755);
  const tempDir = await mkdtemp(join(tmpdir(), "hub-run-claude-cli-"));
  const pidPath = join(tempDir, "fake-claude.pid");
  const previousPath = process.env.CLAUDE_CLI_PATH;
  const previousTimeout = process.env.CLAUDE_CLI_TIMEOUT_MS;
  const previousGrace = process.env.CLAUDE_CLI_FORCE_KILL_GRACE_MS;
  const previousPidPath = process.env.FAKE_CLAUDE_PID_FILE;
  process.env.CLAUDE_CLI_PATH = FAKE_CLAUDE_PATH;
  process.env.CLAUDE_CLI_TIMEOUT_MS = "100";
  process.env.CLAUDE_CLI_FORCE_KILL_GRACE_MS = "20";
  process.env.FAKE_CLAUDE_PID_FILE = pidPath;

  t.after(async () => {
    process.env.CLAUDE_CLI_PATH = previousPath;
    process.env.CLAUDE_CLI_TIMEOUT_MS = previousTimeout;
    process.env.CLAUDE_CLI_FORCE_KILL_GRACE_MS = previousGrace;
    process.env.FAKE_CLAUDE_PID_FILE = previousPidPath;
    await rm(tempDir, { recursive: true, force: true });
  });

  const sendPromise = sendClaudeMessage({
    sessionId: "session-1",
    text: "hang forever",
    cwd: tempDir,
  });
  const outcome = await Promise.race([
    sendPromise.then(
      () => ({ type: "resolved" as const }),
      (error) => ({ type: "rejected" as const, error }),
    ),
    delay(SETTLE_TIMEOUT_MS).then(() => ({ type: "timeout" as const })),
  ]);

  if (outcome.type === "timeout") {
    const pid = await waitForPidFile(pidPath, PID_WAIT_TIMEOUT_MS);
    if (pid !== null) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore cleanup race
      }
    }
    assert.fail("sendClaudeMessage stayed pending after timeout elapsed");
  }

  assert.equal(outcome.type, "rejected");
  assert.match(
    outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    /timed out/i,
  );

  const pid = await waitForPidFile(pidPath, PID_WAIT_TIMEOUT_MS);
  if (pid !== null) {
    await waitForProcessExit(pid, EXIT_TIMEOUT_MS);
  }
});
