import { basename, dirname } from "path";
import {
  readFirstJsonlLine,
} from "../jsonl-window";
import {
  extractMeaningfulDisplay,
  readJsonLines,
  safeJsonParse,
  walkJsonlFiles,
} from "../shared";

export interface ClaudeHistoryEntry {
  display?: string;
  timestamp?: number;
  project?: string;
  sessionId?: string;
}

export interface ClaudeSessionFile {
  filePath: string;
  projectPath: string;
}

export interface ClaudeSessionSnapshot {
  display: string;
  timestamp: number;
  project: string;
  summary: string | null;
}

interface ClaudeRecord {
  timestamp?: string;
  cwd?: string;
  summary?: string;
  message?: {
    content?: unknown;
  };
}

export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/[/.]/g, "-");
}

export function decodeProjectPath(encodedProject: string): string {
  const trimmed = encodedProject.replace(/^-+/, "").trim();
  if (!trimmed) {
    return "";
  }

  const parts = trimmed.split("-").filter(Boolean);
  if (parts.length === 1) {
    return `/${parts[0]}`;
  }

  return `/${parts[0]}/${parts.slice(1).join("-")}`;
}

export async function readClaudeHistoryEntries(
  historyPath: string,
): Promise<ClaudeHistoryEntry[]> {
  const lines = await readJsonLines(historyPath);
  return lines
    .map((line) => safeJsonParse<ClaudeHistoryEntry>(line))
    .filter((entry): entry is ClaudeHistoryEntry => Boolean(entry?.sessionId));
}

export async function readClaudeSessionFiles(
  projectsDir: string,
  knownProjects: Map<string, string>,
): Promise<Map<string, ClaudeSessionFile>> {
  const files = await walkJsonlFiles(projectsDir);
  const index = new Map<string, ClaudeSessionFile>();

  for (const filePath of files) {
    const sessionId = basename(filePath, ".jsonl");
    index.set(sessionId, toClaudeSessionFile(filePath, knownProjects));
  }

  return index;
}

export async function readClaudeSessionSnapshot(
  sessionFile: ClaudeSessionFile,
): Promise<ClaudeSessionSnapshot> {
  const [display, timestamp, cwd, summary] = await Promise.all([
    readClaudeFirstUserSnippet(sessionFile.filePath),
    readClaudeLatestTimestamp(sessionFile.filePath),
    readClaudeSessionCwd(sessionFile.filePath),
    readClaudeSessionSummary(sessionFile.filePath),
  ]);

  return {
    display,
    timestamp,
    project: cwd ?? sessionFile.projectPath,
    summary,
  };
}

export function toClaudeSessionFile(
  filePath: string,
  knownProjects: Map<string, string>,
): ClaudeSessionFile {
  const encodedProject = basename(dirname(filePath));
  return {
    filePath,
    projectPath:
      knownProjects.get(encodedProject) ?? decodeProjectPath(encodedProject),
  };
}

async function readClaudeFirstUserSnippet(filePath: string): Promise<string> {
  const lines = await readJsonLines(filePath);

  for (const line of lines) {
    const record = safeJsonParse<ClaudeRecord>(line);
    const content = record?.message?.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const item of content) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const text = (item as Record<string, unknown>).text;
      if (typeof text !== "string") {
        continue;
      }

      const display = extractMeaningfulDisplay(text);
      if (display) {
        return display;
      }
    }
  }

  return "(empty)";
}

async function readClaudeLatestTimestamp(filePath: string): Promise<number> {
  const lines = await readJsonLines(filePath);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const record = safeJsonParse<ClaudeRecord>(lines[index] ?? "");
    const timestamp = Date.parse(String(record?.timestamp ?? ""));
    if (timestamp > 0) {
      return timestamp;
    }
  }

  return 0;
}

async function readClaudeSessionCwd(filePath: string): Promise<string | null> {
  const lines = await readJsonLines(filePath);

  for (const line of lines) {
    const record = safeJsonParse<ClaudeRecord>(line);
    if (record?.cwd) {
      return record.cwd;
    }
  }

  return null;
}

async function readClaudeSessionSummary(filePath: string): Promise<string | null> {
  const firstLine = await readFirstJsonlLine(filePath);
  if (!firstLine) {
    return null;
  }

  const record = safeJsonParse<ClaudeRecord>(firstLine);
  return typeof record?.summary === "string" ? record.summary : null;
}
