import type { ProviderReasoningEffort } from "../../types";

interface BuildCodexCliArgsInput {
  cwd?: string;
  mode: "create" | "resume";
  sessionId?: string;
  text: string;
  model?: string | null;
  effort?: ProviderReasoningEffort | null;
}

export interface ParsedCodexCliOutput {
  sessionId: string | null;
  outputText: string | null;
}

export interface ParsedCodexCliEvent {
  sessionId?: string;
  outputText?: string;
}

export function buildCodexCliArgs(input: BuildCodexCliArgsInput): string[] {
  const args = ["exec"];
  appendOptionalArg(args, "-C", input.cwd);
  appendOptionalArg(args, "-m", input.model);
  appendOptionalArg(args, "-c", serializeEffort(input.effort));

  if (input.mode === "resume") {
    args.push("resume", input.sessionId?.trim() ?? "");
  }

  args.push(input.text.trim(), "--json", "--skip-git-repo-check");
  return args;
}

export function parseCodexCliJsonLines(output: string): ParsedCodexCliOutput {
  let sessionId: string | null = null;
  let outputText: string | null = null;

  for (const line of output.split("\n")) {
    const event = parseCodexCliJsonEvent(line);
    if (!event) {
      continue;
    }

    if (event.sessionId) {
      sessionId = event.sessionId;
    }
    if (event.outputText) {
      outputText = event.outputText;
    }
  }

  return { sessionId, outputText };
}

export function parseCodexCliJsonEvent(line: string): ParsedCodexCliEvent | null {
  const parsed = safeParseJson(line);
  if (!parsed || typeof parsed.type !== "string") {
    return null;
  }

  const event: ParsedCodexCliEvent = {};
  if (parsed.type === "thread.started" && typeof parsed.thread_id === "string") {
    event.sessionId = parsed.thread_id;
  }

  const outputText = readAgentMessageText(parsed);
  if (outputText) {
    event.outputText = outputText;
  }

  return event.sessionId || event.outputText ? event : null;
}

function appendOptionalArg(args: string[], flag: string, value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return;
  }
  args.push(flag, normalized);
}

function serializeEffort(
  effort?: ProviderReasoningEffort | null,
): string | null {
  const normalized = effort?.trim();
  if (!normalized) {
    return null;
  }
  return `model_reasoning_effort="${normalized}"`;
}

function safeParseJson(line: string): Record<string, unknown> | null {
  const normalized = line.trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readAgentMessageText(record: Record<string, unknown>): string | null {
  if (record.type !== "item.completed") {
    return null;
  }

  const item = record.item;
  if (!item || typeof item !== "object") {
    return null;
  }

  const agentMessage = item as Record<string, unknown>;
  return agentMessage.type === "agent_message" && typeof agentMessage.text === "string"
    ? agentMessage.text
    : null;
}
