import type {
  ProviderReasoningEffort,
  ProviderSessionContext,
} from "../../types";
import { readJsonTailWindow } from "../jsonl-window";
import { safeJsonParse } from "../shared";

const MINIMUM_CONTEXT_LINES = 128;

export async function readCodexSessionContext(
  filePath: string | null,
  sessionId: string,
): Promise<ProviderSessionContext> {
  if (!filePath) {
    return createEmptyContext(sessionId);
  }

  try {
    const { lines } = await readJsonTailWindow(filePath, MINIMUM_CONTEXT_LINES);
    return parseCodexSessionContext(lines.map((entry) => entry.line), sessionId);
  } catch {
    return createEmptyContext(sessionId);
  }
}

function parseCodexSessionContext(
  lines: string[],
  sessionId: string,
): ProviderSessionContext {
  let modelId: string | null = null;
  let reasoningEffort: ProviderReasoningEffort | null = null;
  let usedTokens: number | null = null;
  let modelContextWindow: number | null = null;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = safeJsonParse<{ type?: unknown; payload?: unknown }>(lines[index] ?? "");
    const payload = parsed?.payload;
    if (parsed?.type !== "event_msg" || !payload || typeof payload !== "object") {
      continue;
    }

    const payloadRecord = payload as Record<string, unknown>;
    const payloadType = typeof payloadRecord.type === "string" ? payloadRecord.type : "";

    if (payloadType === "token_count") {
      const info = payloadRecord.info;
      if (info && typeof info === "object") {
        const infoRecord = info as Record<string, unknown>;
        usedTokens ??= readTokenUsage(infoRecord, "last_token_usage");
        usedTokens ??= readTokenUsage(infoRecord, "total_token_usage");
        modelContextWindow ??= readFiniteNumber(infoRecord.model_context_window);
      }
    }

    if (payloadType === "task_started") {
      modelId ??= readString(payloadRecord.model);
      reasoningEffort ??= readReasoningEffort(
        readNestedValue(payloadRecord, ["collaboration_mode", "settings", "reasoning_effort"]),
      );
      modelContextWindow ??= readFiniteNumber(payloadRecord.model_context_window);
    }

    if (modelId && reasoningEffort && usedTokens !== null && modelContextWindow !== null) {
      break;
    }
  }

  return {
    sessionId,
    modelId,
    reasoningEffort,
    usedTokens,
    modelContextWindow,
    contextLeftPercent: computeContextLeftPercent(usedTokens, modelContextWindow),
  };
}

function createEmptyContext(sessionId: string): ProviderSessionContext {
  return {
    sessionId,
    modelId: null,
    reasoningEffort: null,
    usedTokens: null,
    modelContextWindow: null,
    contextLeftPercent: null,
  };
}

function computeContextLeftPercent(
  usedTokens: number | null,
  modelContextWindow: number | null,
) {
  if (modelContextWindow === null) {
    return null;
  }
  if (usedTokens === null) {
    return null;
  }
  if (modelContextWindow <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(100, Math.round(((modelContextWindow - usedTokens) / modelContextWindow) * 100)),
  );
}

function readTokenUsage(
  payload: Record<string, unknown>,
  key: "last_token_usage" | "total_token_usage",
) {
  const usage = payload[key];
  return usage && typeof usage === "object"
    ? readFiniteNumber((usage as Record<string, unknown>).total_tokens)
    : null;
}

function readReasoningEffort(value: unknown): ProviderReasoningEffort | null {
  return value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh"
    ? value
    : null;
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNestedValue(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
