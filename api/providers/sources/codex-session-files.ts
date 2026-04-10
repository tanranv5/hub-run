import { readdir } from "fs/promises";
import { basename, join } from "path";
import type { ConversationMessage } from "../../types";
import {
  readFirstJsonlLine,
  readJsonHeadWindowFromOffset,
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

const SNIPPET_SCAN_BATCH_LINES = 128;

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
  let offset = 0;
  while (true) {
    const window = await readJsonHeadWindowFromOffset(
      filePath,
      offset,
      SNIPPET_SCAN_BATCH_LINES,
    );
    const display = readFirstUserSnippetFromLines(window.lines.map((entry) => entry.line));
    if (display) {
      return display;
    }
    if (window.exhausted) {
      return "(no prompt text)";
    }
    offset = window.endOffset;
  }
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

export async function findCodexSessionFilePath(
  sessionsDir: string,
  sessionId: string,
): Promise<string | null> {
  const targetSuffix = `-${sessionId}.jsonl`;
  const exactName = `${sessionId}.jsonl`;

  async function visit(currentPath: string): Promise<string | null> {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const nextPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        const nested = await visit(nextPath);
        if (nested) {
          return nested;
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
        continue;
      }
      if (entry.name === exactName || entry.name.endsWith(targetSuffix)) {
        return nextPath;
      }
    }
    return null;
  }

  return visit(sessionsDir);
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

function readFirstUserSnippetFromLines(lines: string[]): string | null {
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

  return null;
}
