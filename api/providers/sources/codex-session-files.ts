import { basename } from "path";
import type { ConversationMessage } from "../../types";
import {
  readFirstJsonlLine,
  readJsonLinesWithOffsets,
} from "../jsonl-window";
import {
  extractMeaningfulDisplay,
  readJsonLines,
  safeJsonParse,
  walkJsonlFiles,
} from "../shared";
import { parseCodexConversationEntries } from "./codex-conversation-parser";

export interface CodexSessionMeta {
  id: string;
  cwd: string;
  timestamp: number;
}

export interface CodexSessionFile {
  filePath: string;
  meta: CodexSessionMeta | null;
}

interface CodexRecord {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

export async function readCodexSessionFiles(
  sessionsDir: string,
): Promise<Map<string, CodexSessionFile>> {
  const files = await walkJsonlFiles(sessionsDir);
  const entries = await Promise.all(
    files.map(async (filePath) => {
      const meta = await readCodexSessionMeta(filePath);
      return [meta?.id ?? fallbackCodexSessionIdFromFileName(filePath), { filePath, meta }] as const;
    }),
  );

  return new Map(entries);
}

export async function readCodexFirstUserSnippet(filePath: string): Promise<string> {
  const lines = await readJsonLines(filePath);

  for (const line of lines) {
    const record = safeJsonParse<CodexRecord>(line);
    const payload = record?.payload;
    if (!payload || payload.type !== "message" || payload.role !== "user") {
      continue;
    }

    const display = readFirstMeaningfulTextBlock(
      Array.isArray(payload.content) ? payload.content : [],
    );
    if (display) {
      return display;
    }
  }

  return "(no prompt text)";
}

export async function readCodexConversation(
  filePath: string,
  sessionId: string,
): Promise<ConversationMessage[]> {
  const lines = await readJsonLinesWithOffsets(filePath);
  return parseCodexConversationEntries(lines, sessionId);
}

export function readCodexConversationEntries(
  lines: { line: string; offset: number }[],
  sessionId: string,
): ConversationMessage[] {
  return parseCodexConversationEntries(lines, sessionId);
}

export async function readCodexSessionMeta(
  filePath: string,
): Promise<CodexSessionMeta | null> {
  const firstLine = await readFirstJsonlLine(filePath);
  if (!firstLine) {
    return null;
  }

  const record = safeJsonParse<CodexRecord>(firstLine);
  const payload = record?.payload;
  if (record?.type !== "session_meta" || !payload || typeof payload.id !== "string") {
    return null;
  }

  return {
    id: payload.id,
    cwd: typeof payload.cwd === "string" ? payload.cwd : "",
    timestamp: Date.parse(String(payload.timestamp ?? "")) || 0,
  };
}

export function fallbackCodexSessionIdFromFileName(filePath: string): string {
  const fileName = basename(filePath, ".jsonl");
  const match = fileName.match(
    /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)$/,
  );
  return match?.[1] ?? fileName;
}

function readFirstMeaningfulTextBlock(content: unknown[]): string | null {
  for (const item of content) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const block = item as Record<string, unknown>;
    if (typeof block.text === "string") {
      const display = extractMeaningfulDisplay(block.text);
      if (display) {
        return display;
      }
    }
  }

  return null;
}
