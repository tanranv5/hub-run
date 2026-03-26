import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProviderReasoningEffort } from "../../types";
import {
  buildCodexCliArgs,
  parseCodexCliJsonEvent,
  parseCodexCliJsonLines,
} from "./codex-cli-shared";

const ACCEPT_TIMEOUT_MS = 10_000;
const CREATE_TIMEOUT_MESSAGE = "codex create start timed out";
const SEND_TIMEOUT_MESSAGE = "codex send timed out";

interface CodexCliBaseInput {
  cwd?: string;
  text: string;
  model?: string | null;
  effort?: ProviderReasoningEffort | null;
}

export interface CodexCliCreateInput extends CodexCliBaseInput {
  cwd: string;
}

export interface CodexCliCreateResult {
  sessionId: string;
  outputText: string | null;
}

export interface CodexCliSendInput extends CodexCliBaseInput {
  sessionId: string;
}

export interface CodexCliSendResult {
  sessionId: string;
  outputText: string | null;
}

interface CodexCliChildProcess {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: "error", listener: (error: Error) => void): this;
  on(
    event: "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
}

interface CodexCliSpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: ["ignore", "pipe", "pipe"];
}

type CodexCliSpawn = (
  command: string,
  args: string[],
  options: CodexCliSpawnOptions,
) => CodexCliChildProcess;

interface CodexCliRunnerOptions {
  acceptTimeoutMs?: number;
}

export function isCodexCliAvailable(): boolean {
  const executablePath = resolveCodexExecutablePath();
  if (executablePath !== "codex" && !existsSync(executablePath)) {
    return false;
  }

  const result = spawnSync(executablePath, ["--version"], { stdio: "ignore" });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return code !== "ENOENT";
  }
  return result.status === 0;
}

export async function createCodexCliSession(
  input: CodexCliCreateInput,
): Promise<CodexCliCreateResult> {
  const output = await runCodexCliUntilAccepted(
    buildCodexCliArgs({ ...input, mode: "create" }),
    input.cwd,
    CREATE_TIMEOUT_MESSAGE,
  );
  if (!output.sessionId) {
    throw new Error("codex create failed: missing thread id");
  }
  return { sessionId: output.sessionId, outputText: output.outputText };
}

export async function sendCodexCliMessage(
  input: CodexCliSendInput,
): Promise<CodexCliSendResult> {
  const cwd = input.cwd?.trim() || process.cwd();
  const output = await runCodexCliUntilAccepted(
    buildCodexCliArgs({ ...input, mode: "resume" }),
    cwd,
    SEND_TIMEOUT_MESSAGE,
  );
  return {
    sessionId: output.sessionId ?? input.sessionId.trim(),
    outputText: output.outputText,
  };
}

export function createCodexCliRunner(
  spawnProcess: CodexCliSpawn = spawn,
  options: CodexCliRunnerOptions = {},
) {
  const acceptTimeoutMs = options.acceptTimeoutMs ?? ACCEPT_TIMEOUT_MS;
  return {
    runUntilAccepted(command: string, args: string[], cwd: string, timeoutMessage: string) {
      return runCommandUntilAccepted(
        spawnProcess,
        command,
        args,
        cwd,
        acceptTimeoutMs,
        timeoutMessage,
      );
    },
  };
}

async function runCodexCliUntilAccepted(
  args: string[],
  cwd: string,
  timeoutMessage: string,
) {
  const runner = createCodexCliRunner();
  return runner.runUntilAccepted(
    resolveCodexExecutablePath(),
    args,
    cwd,
    timeoutMessage,
  );
}

function runCommandUntilAccepted(
  spawnProcess: CodexCliSpawn,
  command: string,
  args: string[],
  cwd: string,
  acceptTimeoutMs: number,
  timeoutMessage: string,
): Promise<{ sessionId: string | null; outputText: string | null }> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const state = {
      accepted: false,
      settled: false,
      lineBuffer: "",
      outputText: null as string | null,
      sessionId: null as string | null,
      stderr: "",
      stdout: "",
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settleReject(state, timer, reject, new Error(timeoutMessage));
    }, acceptTimeoutMs);

    bindStream(child.stdout, (chunk) => {
      state.stdout += chunk;
      handleStdoutChunk(state, chunk, timer, resolve);
    });
    bindStream(child.stderr, (chunk) => {
      state.stderr += chunk;
    });
    child.on("error", (error) => {
      settleReject(state, timer, reject, error);
    });
    child.on("close", (code, signal) => {
      if (state.accepted) {
        clearTimeout(timer);
        return;
      }
      const output = parseCodexCliJsonLines(state.stdout);
      if (output.sessionId) {
        settleResolve(state, timer, resolve, output);
        return;
      }
      settleReject(
        state,
        timer,
        reject,
        new Error(`codex send failed: ${resolveFailureReason(state, signal)}`),
      );
    });
  });
}

function bindStream(
  stream: NodeJS.ReadableStream | null,
  onChunk: (chunk: string) => void,
) {
  if (!stream) {
    return;
  }
  stream.setEncoding("utf-8");
  stream.on("data", onChunk);
}

function handleStdoutChunk(
  state: {
    accepted: boolean;
    settled: boolean;
    lineBuffer: string;
    outputText: string | null;
    sessionId: string | null;
    stdout: string;
  },
  chunk: string,
  timer: NodeJS.Timeout,
  resolve: (value: { sessionId: string | null; outputText: string | null }) => void,
) {
  if (state.settled) {
    return;
  }

  const lines = readCompleteLines(state, chunk);
  for (const line of lines) {
    const event = parseCodexCliJsonEvent(line);
    if (!event) {
      continue;
    }
    if (event.outputText) {
      state.outputText = event.outputText;
    }
    if (event.sessionId) {
      state.sessionId = event.sessionId;
      settleResolve(state, timer, resolve, {
        sessionId: state.sessionId,
        outputText: state.outputText,
      });
      return;
    }
  }
}

function readCompleteLines(
  state: { lineBuffer: string },
  chunk: string,
): string[] {
  state.lineBuffer += chunk;
  const lines: string[] = [];
  let newlineIndex = state.lineBuffer.indexOf("\n");

  while (newlineIndex >= 0) {
    lines.push(state.lineBuffer.slice(0, newlineIndex));
    state.lineBuffer = state.lineBuffer.slice(newlineIndex + 1);
    newlineIndex = state.lineBuffer.indexOf("\n");
  }

  return lines;
}

function settleResolve(
  state: { accepted: boolean; settled: boolean },
  timer: NodeJS.Timeout,
  resolve: (value: { sessionId: string | null; outputText: string | null }) => void,
  value: { sessionId: string | null; outputText: string | null },
) {
  if (state.settled) {
    return;
  }
  state.settled = true;
  state.accepted = true;
  clearTimeout(timer);
  resolve(value);
}

function settleReject(
  state: { settled: boolean },
  timer: NodeJS.Timeout,
  reject: (error: Error) => void,
  error: Error,
) {
  if (state.settled) {
    return;
  }
  state.settled = true;
  clearTimeout(timer);
  reject(error);
}

function resolveFailureReason(
  chunks: { stdout: string; stderr: string },
  signal: NodeJS.Signals | null,
): string {
  return chunks.stderr.trim() || chunks.stdout.trim() || signal || "unknown error";
}

function resolveCodexExecutablePath(): string {
  const envPath = process.env["CODEX_CLI_PATH"]?.trim();
  if (envPath) {
    return envPath;
  }

  const home = process.env["HOME"]?.trim();
  const candidates = [
    home ? join(home, ".npm-global/bin/codex") : null,
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return "codex";
}
