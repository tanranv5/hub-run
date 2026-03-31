import type { ConversationBlock, ConversationMessage } from "../api/types";
import { sanitizeConversationText } from "../api/providers/display-text";

const TOOL_LABEL_RULES = [
  { pattern: /bash|shell|terminal|exec|command/i, label: "脚本" },
  { pattern: /read|file/i, label: "读取文件" },
  { pattern: /grep|search/i, label: "搜索" },
  { pattern: /edit|write|patch|apply_patch/i, label: "写入文件" },
  { pattern: /task|todo/i, label: "任务" },
  { pattern: /web|fetch|url/i, label: "网页" },
];

const TOOL_PREVIEW_MAX_LENGTH = 96;
const SKILL_TAG = "skill";
const SUBAGENT_NOTIFICATION_TAG = "subagent_notification";
const TURN_ABORTED_TAG = "turn_aborted";

interface LeadingTaggedText {
  tagName: string;
  content: string;
  remainingText: string;
  wrapped: boolean;
}

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function parseSkillInvocation(text: string): {
  name: string;
  path: string | null;
  detailsText: string;
  remainingText: string;
} | null {
  const tagged = parseLeadingTaggedText(text);
  if (!tagged || tagged.tagName !== SKILL_TAG) {
    return null;
  }
  if (tagged.wrapped) {
    return parseWrappedSkillInvocation(tagged);
  }
  return parseInlineSkillInvocation(text);
}

export function parseSubagentNotification(text: string): {
  agentId: string | null;
  detailsText: string;
  remainingText: string;
  statusLabel: string;
} | null {
  const tagged = parseLeadingTaggedText(text);
  if (!tagged || tagged.tagName !== SUBAGENT_NOTIFICATION_TAG) {
    return null;
  }
  if (!tagged.wrapped) {
    return {
      agentId: null,
      detailsText: "状态: 通知",
      remainingText: tagged.remainingText,
      statusLabel: "通知",
    };
  }
  const payload = parseJsonLikeText(tagged.content);
  const agentId = readSubagentAgentId(payload);
  const status = readSubagentStatus(payload);
  return {
    agentId,
    detailsText: formatSubagentNotificationDetails(agentId, status.label, status.details),
    remainingText: tagged.remainingText,
    statusLabel: status.label,
  };
}

export function parseTaggedControlMessage(text: string): {
  badge: string;
  detailsText: string;
  remainingText: string;
  subtitle: string;
  tone: "amber" | "rose";
} | null {
  const tagged = parseLeadingTaggedText(text);
  if (!tagged || tagged.tagName === SKILL_TAG || tagged.tagName === SUBAGENT_NOTIFICATION_TAG) {
    return null;
  }
  const detailsText = tagged.wrapped ? tagged.content : tagged.remainingText;
  if (!detailsText) {
    return null;
  }
  return {
    ...readTaggedControlMeta(tagged.tagName),
    detailsText,
    remainingText: tagged.wrapped ? tagged.remainingText : "",
  };
}

export function resolveToolTitle(
  message: ConversationMessage,
  previousMessage?: ConversationMessage | null,
): string | null {
  const block = getMessageBlock(message);
  if (block.type === "tool_use" && block.name) {
    return block.name;
  }
  if (block.type === "tool_result" && block.name) {
    return block.name;
  }
  if (message.title) {
    return message.title;
  }

  if (
    message.kind === "tool_result" &&
    previousMessage?.kind === "tool_use"
  ) {
    const previousBlock = getMessageBlock(previousMessage);
    return previousBlock.name ?? previousMessage.title ?? null;
  }

  return null;
}

function parseWrappedSkillInvocation(
  tagged: LeadingTaggedText,
): { name: string; path: string | null; detailsText: string; remainingText: string } | null {
  const fields = readSkillFields(tagged.content);
  if (!fields) {
    return null;
  }
  const detailsBody = stripTaggedField(
    stripTaggedField(tagged.content, "name"),
    "path",
  );
  return {
    ...fields,
    detailsText: formatSkillDetails(fields.name, fields.path, detailsBody),
    remainingText: tagged.remainingText,
  };
}

function parseInlineSkillInvocation(
  text: string,
): { name: string; path: string | null; detailsText: string; remainingText: string } | null {
  const trimmed = text.trimStart();
  const fields = readSkillFields(trimmed);
  if (!fields) {
    return null;
  }
  const pathMatch = trimmed.match(/<path>\s*([\s\S]*?)\s*<\/path>/i);
  const nameMatch = trimmed.match(/<name>\s*([\s\S]*?)\s*<\/name>/i);
  const trailingMatch = pathMatch ?? nameMatch;
  const remainingText = trailingMatch
    ? trimmed
      .slice((trailingMatch.index ?? 0) + trailingMatch[0].length)
      .replace(/^\s*<\/skill>\s*/i, "")
      .trim()
    : "";
  return {
    ...fields,
    detailsText: formatSkillDetails(fields.name, fields.path, ""),
    remainingText,
  };
}

export function getToolLabel(toolTitle: string | null): string {
  if (!toolTitle) {
    return "工具";
  }

  const matched = TOOL_LABEL_RULES.find(({ pattern }) => pattern.test(toolTitle));
  return matched?.label ?? "工具";
}

export function summarizeToolText(text: string): string {
  const normalized = normalizeInlineText(text);
  if (!normalized) {
    return "无额外输出";
  }

  if (normalized.length <= TOOL_PREVIEW_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, TOOL_PREVIEW_MAX_LENGTH)}...`;
}

export function getMessageBlock(message: ConversationMessage): ConversationBlock {
  if (message.block) {
    return message.block;
  }

  if (message.kind === "image") {
    return { type: "image", imagePath: message.text || undefined };
  }
  if (message.kind === "thinking") {
    return { type: "thinking", thinking: message.text };
  }
  if (message.kind === "tool_use") {
    return {
      type: "tool_use",
      name: message.title,
      input: parseJsonLikeText(message.text) ?? message.text,
    };
  }
  if (message.kind === "tool_result") {
    return {
      type: "tool_result",
      name: message.title,
      content: parseJsonLikeText(message.text) ?? message.text,
    };
  }
  return {
    type: message.kind,
    text: message.text,
    title: message.title,
  };
}

export function stringifyStructuredValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function summarizeToolBlock(block: ConversationBlock): string {
  const preview = block.type === "tool_use"
    ? readToolPreview(block.input)
    : readToolPreview(block.content);
  return summarizeToolText(preview);
}

export function parseJsonLikeText(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function readToolPreview(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.questions)) {
      return `${record.questions.length} question(s)`;
    }
    if (Array.isArray(record.todos)) {
      return `${record.todos.length} task(s)`;
    }
    const primary =
      record.command ??
      record.cmd ??
      record.file_path ??
      record.path ??
      record.pattern ??
      record.prompt ??
      record.description;
    if (typeof primary === "string" && primary.trim()) {
      return primary;
    }
  }
  return stringifyStructuredValue(value);
}

function extractWrappedBlock(
  text: string,
  tagName: string,
): { content: string; remainingText: string } | null {
  const trimmed = text.trimStart();
  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;
  if (!trimmed.startsWith(openTag)) {
    return null;
  }
  const closeIndex = trimmed.indexOf(closeTag);
  if (closeIndex < 0) {
    return null;
  }
  return {
    content: trimmed.slice(openTag.length, closeIndex).trim(),
    remainingText: trimmed.slice(closeIndex + closeTag.length).trim(),
  };
}

function parseLeadingTaggedText(text: string): LeadingTaggedText | null {
  const trimmed = text.trimStart();
  const tagMatch = trimmed.match(/^<([a-z][\w-]*)>/i);
  if (!tagMatch) {
    return null;
  }
  const tagName = tagMatch[1].toLowerCase();
  const wrappedBlock = extractWrappedBlock(trimmed, tagName);
  if (wrappedBlock) {
    return {
      tagName,
      content: wrappedBlock.content,
      remainingText: wrappedBlock.remainingText,
      wrapped: true,
    };
  }
  return {
    tagName,
    content: "",
    remainingText: trimmed.slice(tagMatch[0].length).trim(),
    wrapped: false,
  };
}

function readSkillFields(text: string): { name: string; path: string | null } | null {
  const nameMatch = text.match(/<name>\s*([\s\S]*?)\s*<\/name>/i);
  if (!nameMatch) {
    return null;
  }
  const pathMatch = text.match(/<path>\s*([\s\S]*?)\s*<\/path>/i);
  return {
    name: nameMatch[1].trim(),
    path: pathMatch ? pathMatch[1].trim() : null,
  };
}

function stripTaggedField(text: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}>\\s*[\\s\\S]*?\\s*</${tagName}>`, "i");
  return text.replace(pattern, "").trim();
}

function formatSkillDetails(name: string, path: string | null, body: string): string {
  const lines = [`名称: ${name}`];
  if (path) {
    lines.push(`路径: ${path}`);
  }
  if (body) {
    lines.push("");
    lines.push(body);
  }
  return lines.join("\n");
}

function readTaggedControlMeta(
  tagName: string,
): { badge: string; subtitle: string; tone: "amber" | "rose" } {
  if (tagName === TURN_ABORTED_TAG) {
    return {
      badge: "已中断",
      subtitle: "status",
      tone: "rose",
    };
  }
  return {
    badge: "标签",
    subtitle: tagName.replace(/_/g, " "),
    tone: "amber",
  };
}

function readSubagentAgentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const agentId = (payload as { agent_id?: unknown }).agent_id;
  return typeof agentId === "string" && agentId.trim() ? agentId.trim() : null;
}

function readSubagentStatus(payload: unknown): { label: string; details: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      label: "通知",
      details: stringifyStructuredValue(payload),
    };
  }
  const status = (payload as { status?: unknown }).status;
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    return {
      label: "通知",
      details: stringifyStructuredValue(payload),
    };
  }
  for (const [key, value] of Object.entries(status)) {
    return {
      label: mapSubagentStatusLabel(key),
      details: stringifyStructuredValue(value),
    };
  }
  return {
    label: "通知",
    details: stringifyStructuredValue(payload),
  };
}

function mapSubagentStatusLabel(status: string): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "failed":
    case "error":
      return "失败";
    case "interrupted":
      return "已中断";
    case "running":
      return "运行中";
    case "queued":
      return "排队中";
    default:
      return "通知";
  }
}

function formatSubagentNotificationDetails(
  agentId: string | null,
  statusLabel: string,
  details: string,
): string {
  const lines = [`状态: ${statusLabel}`];
  if (agentId) {
    lines.push(`代理: ${agentId}`);
  }
  if (details.trim()) {
    lines.push("", details.trim());
  }
  return lines.join("\n");
}

export { sanitizeConversationText };
