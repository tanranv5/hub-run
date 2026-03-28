import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type {
  ConversationMessage,
  ConversationPage,
  SessionSummary,
  SessionsPage,
} from "../types";
import { extractMeaningfulDisplay } from "./display-text";
export { extractMeaningfulDisplay } from "./display-text";

export function getProjectName(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

export function normalizeDisplay(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed || "(empty)";
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function walkJsonlFiles(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function visit(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(
      () => [],
    );

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const nextPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(nextPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(nextPath);
      }
    }
  }

  await visit(rootPath);
  return results.sort();
}

export async function readJsonLines(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, "utf-8").catch(() => "");
  return content.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function stringifyContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseCursorInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function paginateMessages(
  messages: ConversationMessage[],
  before: string | null,
  limit: number,
): Pick<ConversationPage, "messages" | "nextBefore"> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, limit) : 50;
  const end = parseCursorInt(before) ?? messages.length;
  const start = Math.max(0, end - safeLimit);

  return {
    messages: messages.slice(start, end),
    nextBefore: start > 0 ? String(start) : null,
  };
}

export function paginateSessions(
  sessions: SessionSummary[],
  before: string | null,
  limit: number,
): SessionsPage {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, limit) : 50;
  const start = parseCursorInt(before) ?? 0;
  const end = Math.min(sessions.length, start + safeLimit);

  return {
    sessions: sessions.slice(start, end),
    nextBefore: end < sessions.length ? String(end) : null,
    totalCount: sessions.length,
  };
}
