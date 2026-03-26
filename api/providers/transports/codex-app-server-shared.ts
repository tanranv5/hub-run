import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  ProviderModelOption,
  ProviderReasoningEffort,
} from "../../types";

export class CodexAppServerRpcError extends Error {
  public readonly code: number;

  public constructor(code: number, message: string) {
    super(message);
    this.name = "CodexAppServerRpcError";
    this.code = code;
  }
}

export class CodexAppServerTransportError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CodexAppServerTransportError";
  }
}

export function extractThreadId(result: unknown): string {
  if (!result || typeof result !== "object") {
    throw new CodexAppServerTransportError("Invalid thread/start response from codex app-server");
  }

  const thread = (result as { thread?: unknown }).thread;
  if (!thread || typeof thread !== "object") {
    throw new CodexAppServerTransportError("Missing thread payload in thread/start response");
  }

  const threadId = asString((thread as Record<string, unknown>).id)?.trim();
  if (!threadId) {
    throw new CodexAppServerTransportError("Missing thread id in thread/start response");
  }

  return threadId;
}

export function extractTurnId(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const turn = (result as { turn?: unknown }).turn;
  if (!turn || typeof turn !== "object") {
    return null;
  }

  const turnId = (turn as { id?: unknown }).id;
  return typeof turnId === "string" && turnId.trim() ? turnId : null;
}

export function parseModelOptions(result: unknown): ProviderModelOption[] {
  if (!result || typeof result !== "object") {
    throw new CodexAppServerTransportError("Invalid model/list response from codex app-server");
  }

  const data = (result as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    throw new CodexAppServerTransportError("Missing model data in codex app-server response");
  }

  return data.flatMap((entry) => parseModelOption(entry));
}

export function shouldRetryAfterResume(error: unknown): boolean {
  if (!(error instanceof CodexAppServerRpcError)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("thread not found") ||
    message.includes("thread not loaded") ||
    message.includes("not loaded");
}

export function resolveCodexExecutablePath(): string {
  const envPath = process.env["CODEX_CLI_PATH"]?.trim();
  if (envPath) {
    return envPath;
  }

  if (isCommandAvailable("codex")) {
    return "codex";
  }

  const desktopPath = "/Applications/Codex.app/Contents/Resources/codex";
  if (existsSync(desktopPath)) {
    return desktopPath;
  }

  return "codex";
}

export function isCodexTransportAvailable(): boolean {
  const executablePath = resolveCodexExecutablePath();
  return executablePath === "codex"
    ? isCommandAvailable("codex")
    : existsSync(executablePath);
}

function parseModelOption(entry: unknown): ProviderModelOption[] {
  if (!entry || typeof entry !== "object") {
    return [];
  }

  const record = entry as Record<string, unknown>;
  const fallbackModelName = asString(record.model)?.trim();
  const id = asString(record.id)?.trim() || fallbackModelName;
  if (!id) {
    return [];
  }

  return [
    {
      id,
      displayName: asString(record.displayName)?.trim() || id,
      description: asString(record.description)?.trim() || "",
      isDefault: record.isDefault === true,
      hidden: record.hidden === true,
      defaultReasoningEffort: toReasoningEffort(record.defaultReasoningEffort),
      supportedReasoningEfforts: collectSupportedReasoningEfforts(
        record.supportedReasoningEfforts,
      ),
    },
  ];
}

function collectSupportedReasoningEfforts(value: unknown): ProviderReasoningEffort[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const efforts = new Set<ProviderReasoningEffort>();
  for (const entry of value) {
    const effort = toReasoningEffort(
      entry && typeof entry === "object"
        ? (entry as { reasoningEffort?: unknown }).reasoningEffort
        : entry,
    );
    if (effort) {
      efforts.add(effort);
    }
  }

  return [...efforts];
}

function toReasoningEffort(value: unknown): ProviderReasoningEffort | null {
  if (value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }

  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isCommandAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return code !== "ENOENT";
  }

  return result.status === 0;
}
