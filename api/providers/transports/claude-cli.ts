import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_FORCE_KILL_GRACE_MS = 1_000;

export interface ClaudeSendInput {
  sessionId: string;
  text: string;
  cwd: string;
}

export interface ClaudeCreateSessionInput {
  sessionId?: string;
  text: string;
  cwd: string;
}

export interface ClaudeSendResult {
  outputText: string | null;
}

export interface ClaudeCreateSessionResult extends ClaudeSendResult {
  sessionId: string;
}

type ClaudeSessionMode = "create" | "resume";

interface ClaudeRunProcessInput {
  mode: ClaudeSessionMode;
  sessionId: string;
  text: string;
  cwd: string;
}

interface ClaudeSendRuntimeOptions {
  timeoutMs: number;
  forceKillGraceMs: number;
}

export function isClaudeCliAvailable(): boolean {
  const executablePath = resolveClaudeExecutablePath();
  if (executablePath !== "claude") {
    const result = spawnSync(process.execPath, [executablePath, "--version"], {
      stdio: "ignore",
    });
    return result.status === 0;
  }

  const result = spawnSync("claude", ["--version"], {
    stdio: "ignore",
  });

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return code !== "ENOENT";
  }

  return result.status === 0;
}

export async function sendClaudeMessage(
  input: ClaudeSendInput,
): Promise<ClaudeSendResult> {
  return runClaudeSendProcess(
    validateClaudeResumeInput(input),
    readClaudeSendRuntimeOptions(),
  );
}

export async function createClaudeSession(
  input: ClaudeCreateSessionInput,
): Promise<ClaudeCreateSessionResult> {
  const processInput = validateClaudeCreateInput(input);
  const result = await runClaudeSendProcess(
    processInput,
    readClaudeSendRuntimeOptions(),
  );
  return {
    sessionId: processInput.sessionId,
    outputText: result.outputText,
  };
}

function validateClaudeResumeInput(input: ClaudeSendInput): ClaudeRunProcessInput {
  const sessionId = input.sessionId.trim();
  const text = input.text.trim();
  const cwd = input.cwd.trim();

  if (!sessionId) {
    throw new Error("sessionId is required");
  }
  if (!text) {
    throw new Error("text is required");
  }
  if (!cwd) {
    throw new Error("cwd is required");
  }

  return { mode: "resume", sessionId, text, cwd };
}

function validateClaudeCreateInput(
  input: ClaudeCreateSessionInput,
): ClaudeRunProcessInput {
  const sessionId = input.sessionId?.trim() || randomUUID();
  const text = input.text.trim();
  const cwd = input.cwd.trim();

  if (!text) {
    throw new Error("text is required");
  }
  if (!cwd) {
    throw new Error("cwd is required");
  }

  return { mode: "create", sessionId, text, cwd };
}

function readClaudeSendRuntimeOptions(): ClaudeSendRuntimeOptions {
  return {
    timeoutMs: readDurationFromEnv("CLAUDE_CLI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    forceKillGraceMs: readDurationFromEnv(
      "CLAUDE_CLI_FORCE_KILL_GRACE_MS",
      DEFAULT_FORCE_KILL_GRACE_MS,
      true,
    ),
  };
}

function readDurationFromEnv(
  key: string,
  fallback: number,
  allowZero = false,
) {
  const raw = process.env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    return fallback;
  }
  return parsed;
}

function runClaudeSendProcess(
  input: ClaudeRunProcessInput,
  runtime: ClaudeSendRuntimeOptions,
): Promise<ClaudeSendResult> {
  const action = describeClaudeAction(input.mode);
  return new Promise((resolve, reject) => {
    const child = spawnClaudeCli(input);
    const stdout: string[] = [];
    const stderr: string[] = [];
    let timeoutTimer: NodeJS.Timeout | null = null;
    let forceKillTimer: NodeJS.Timeout | null = null;
    let settled = false;

    const clearTimers = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      callback();
    };

    timeoutTimer = setTimeout(() => {
      settle(() => {
        reject(new Error(`claude ${action} timed out`));
      });
      terminateClaudeChild(child, runtime.forceKillGraceMs, (timer) => {
        forceKillTimer = timer;
      });
    }, runtime.timeoutMs);
    collectClaudeProcessOutput(child, stdout, stderr);
    child.on("error", (error) => {
      settle(() => {
        reject(error);
      });
    });
    child.on("close", (code, signal) => {
      clearTimers();
      if (settled) {
        return;
      }
      settle(() => {
        if (code !== 0) {
          reject(
            new Error(
              `claude ${action} failed: ${readClaudeFailureReason(stdout, stderr, signal)}`,
            ),
          );
          return;
        }
        resolve({
          outputText: stdout.join("").trim() || null,
        });
      });
    });
  });
}

function collectClaudeProcessOutput(
  child: ReturnType<typeof spawn>,
  stdout: string[],
  stderr: string[],
) {
  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk: string) => {
    stdout.push(chunk);
  });
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk: string) => {
    stderr.push(chunk);
  });
}

function describeClaudeAction(mode: ClaudeSessionMode): "create" | "send" {
  return mode === "create" ? "create" : "send";
}

function spawnClaudeCli(
  input: ClaudeRunProcessInput,
) {
  const command = resolveClaudeExecutablePath();
  const sessionArgs = input.mode === "resume"
    ? ["--resume", input.sessionId]
    : ["--session-id", input.sessionId];
  return spawn(
    command === "claude" ? "claude" : process.execPath,
    [
      ...(command === "claude" ? [] : [command]),
      ...sessionArgs,
      "--print",
      "--output-format",
      "text",
      input.text,
    ],
    {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function terminateClaudeChild(
  child: ReturnType<typeof spawn>,
  forceKillGraceMs: number,
  setForceKillTimer: (timer: NodeJS.Timeout | null) => void,
): void {
  child.kill("SIGTERM");
  if (forceKillGraceMs === 0) {
    child.kill("SIGKILL");
    return;
  }

  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, forceKillGraceMs);
  setForceKillTimer(timer);
}

function readClaudeFailureReason(
  stdout: string[],
  stderr: string[],
  signal: NodeJS.Signals | null,
) {
  return stderr.join("").trim() || stdout.join("").trim() || signal || "unknown error";
}

function resolveClaudeExecutablePath(): string {
  const envPath = process.env["CLAUDE_CLI_PATH"]?.trim();
  if (envPath) {
    return envPath;
  }

  const home = process.env["HOME"]?.trim();
  const candidates = [
    home ? join(home, ".npm-global/bin/claude") : null,
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return "claude";
}
