import type {
  ConversationKind,
  ConversationMessage,
} from "../../types";
import {
  createConversationAnchor,
  createConversationMessageId,
} from "../conversation-anchor";
import { stringifyContent } from "../shared";

const IMAGE_PLACEHOLDER_PATTERN = /^<image name=\[[^\]]+\]>$/i;
const IMAGE_WRAPPER_TAGS = new Set(["<image>", "</image>"]);

export function createMessageId(
  sessionId: string,
  lineOffset: number,
  blockIndex: number,
) {
  return createConversationMessageId(sessionId, lineOffset, blockIndex);
}

export function readToolTitle(
  payload: Record<string, unknown>,
  fallback: string,
): string {
  return typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim()
    : fallback;
}

export function readCallId(
  payload: Record<string, unknown>,
  lineIndex: number,
): string {
  if (typeof payload.call_id === "string" && payload.call_id.trim()) {
    return payload.call_id.trim();
  }
  return `call-${lineIndex}`;
}

export function readReasoningText(payload: Record<string, unknown>): string {
  if (Array.isArray(payload.summary)) {
    const lines = payload.summary
      .map((item) => {
        if (!item || typeof item !== "object") {
          return "";
        }
        const summaryItem = item as Record<string, unknown>;
        return typeof summaryItem.text === "string" ? summaryItem.text.trim() : "";
      })
      .filter(Boolean);
    if (lines.length > 0) {
      return lines.join("\n\n");
    }
  }

  if (typeof payload.content === "string") {
    return payload.content.trim();
  }
  return "";
}

export function normalizeCodexBlock(
  sessionId: string,
  lineOffset: number,
  blockIndex: number,
  role: "user" | "assistant",
  timestamp: string | undefined,
  item: unknown,
): ConversationMessage | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const block = item as Record<string, unknown>;
  const text = typeof block.text === "string" ? block.text : "";
  const kind = typeof block.type === "string" ? block.type : "";
  const base = {
    anchor: createConversationAnchor(lineOffset, blockIndex),
    id: createMessageId(sessionId, lineOffset, blockIndex),
    role,
    timestamp,
  } as const;

  if (kind === "input_text" || kind === "output_text" || kind === "text") {
    if (isIgnorableImageWrapperText(text)) {
      return null;
    }
    return {
      ...base,
      kind: "text",
      text,
      block: {
        type: "text",
        text,
      },
    };
  }
  const imageBlock = readImageBlock(block, kind);
  if (imageBlock) {
    return {
      ...base,
      kind: "image",
      text: imageBlock.imagePath ?? "",
      block: imageBlock,
    };
  }
  if (kind === "reasoning" || kind === "thinking") {
    return {
      ...base,
      kind: "thinking",
      text,
      block: {
        type: "thinking",
        thinking: text,
      },
    };
  }
  if (kind === "tool_use") {
    const name = typeof block.name === "string" ? block.name : "tool_use";
    return {
      ...base,
      kind: "tool_use",
      text: stringifyContent(block.input ?? ""),
      title: name,
      block: {
        type: "tool_use",
        id: typeof block.id === "string" ? block.id : undefined,
        name,
        input: block.input ?? "",
      },
    };
  }
  if (kind === "tool_result") {
    const content = block.content ?? "";
    return {
      ...base,
      kind: "tool_result",
      text: stringifyContent(content),
      block: {
        type: "tool_result",
        toolUseId: typeof block.tool_use_id === "string" ? block.tool_use_id : undefined,
        content,
        isError: block.is_error === true,
      },
    };
  }

  return null;
}

function isIgnorableImageWrapperText(text: string): boolean {
  const normalized = text.trim();
  return (
    IMAGE_WRAPPER_TAGS.has(normalized) ||
    IMAGE_PLACEHOLDER_PATTERN.test(normalized)
  );
}

function readImageBlock(
  block: Record<string, unknown>,
  kind: string,
): ConversationMessage["block"] | null {
  if (kind === "input_image") {
    const imageUrl = readString(block.image_url);
    return imageUrl ? { type: "image", imageUrl } : null;
  }
  if (kind === "image") {
    const imageUrl = readString(block.url) ?? readString(block.image_url);
    return imageUrl ? { type: "image", imageUrl } : null;
  }
  if (kind !== "localImage") {
    return null;
  }
  const imagePath = readString(block.path);
  return imagePath ? { type: "image", imagePath } : null;
}

export function readEventStatusText(
  payloadType: string,
  payload: Record<string, unknown>,
): { kind: ConversationKind; title: string; text: string } | null {
  if (payloadType === "error") {
    const message = readString(payload.message)?.trim() ?? "";
    const errorInfo = readString(payload.codex_error_info)?.trim() ?? "";
    const text = message ? `执行失败：${message}` : "执行失败。";
    return {
      kind: "text",
      title: "error",
      text: errorInfo ? `${text}（${errorInfo}）` : text,
    };
  }

  if (payloadType === "task_complete") {
    const turnId = typeof payload.turn_id === "string" ? payload.turn_id : "";
    return {
      kind: "text",
      title: "status",
      text: turnId ? `任务已完成（turn=${turnId}）` : "任务已完成",
    };
  }

  if (payloadType === "task_started") {
    const turnId = typeof payload.turn_id === "string" ? payload.turn_id : "";
    return {
      kind: "text",
      title: "status",
      text: turnId ? `任务已开始（turn=${turnId}）。` : "任务已开始。",
    };
  }

  if (payloadType === "turn_aborted") {
    const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    return {
      kind: "turn_aborted",
      title: "status",
      text: reason ? `当前轮次已中断（${reason}）。` : "当前轮次已中断。",
    };
  }

  if (payloadType === "turn_context") {
    const context = readTurnContextText(payload);
    return context ? { kind: "text", title: "context", text: context } : null;
  }

  if (payloadType === "token_count") {
    return null;
  }

  return null;
}

function readTurnContextText(payload: Record<string, unknown>): string | null {
  const cwd = typeof payload.cwd === "string" ? payload.cwd : "";
  const model = typeof payload.model === "string" ? payload.model : "";
  const effort = readNestedString(payload, ["collaboration_mode", "settings", "reasoning_effort"]);
  const timezone = typeof payload.timezone === "string" ? payload.timezone : "";
  const parts = [];
  if (cwd) {
    parts.push(`cwd=${cwd}`);
  }
  if (model) {
    parts.push(`model=${model}`);
  }
  if (effort) {
    parts.push(`effort=${effort}`);
  }
  if (timezone) {
    parts.push(`tz=${timezone}`);
  }
  return parts.length > 0 ? parts.join("，") : null;
}

function readNestedNumber(
  value: Record<string, unknown>,
  path: string[],
): number | null {
  const target = readNestedValue(value, path);
  return typeof target === "number" ? target : null;
}

function readNestedString(
  value: Record<string, unknown>,
  path: string[],
): string | null {
  const target = readNestedValue(value, path);
  return typeof target === "string" ? target : null;
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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
