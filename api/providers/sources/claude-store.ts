import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import type { ConversationPage, SessionSummary } from "../../types";
import {
  isNumericBeforeCursor,
  parseMessageWindowCursor,
  readJsonLinesWithOffsets,
} from "../jsonl-window";
import { watchProviderRoot } from "../provider-root-watcher";
import { extractMeaningfulDisplay, getProjectName, paginateMessages } from "../shared";
import { parseClaudeConversationEntries } from "./claude-conversation";
import {
  readLatestClaudeConversationPage,
  readPrefixClaudeConversationPage,
  readTailClaudeConversationPage,
} from "./claude-conversation-pages";
import {
  encodeProjectPath,
  readClaudeHistoryEntries,
  readClaudeSessionFiles,
  readClaudeSessionSnapshot,
  toClaudeSessionFile,
  type ClaudeHistoryEntry,
  type ClaudeSessionFile,
  type ClaudeSessionSnapshot,
} from "./claude-session-files";

interface ClaudeStoreState {
  historyEntries: ClaudeHistoryEntry[] | null;
  knownProjects: Map<string, string> | null;
  sessionFiles: Map<string, ClaudeSessionFile> | null;
  snapshotCache: Map<string, ClaudeSessionSnapshot>;
}

export function createClaudeSessionStore(rootPath: string) {
  const historyPath = join(rootPath, "history.jsonl");
  const projectsDir = join(rootPath, "projects");
  const state: ClaudeStoreState = {
    historyEntries: null,
    knownProjects: null,
    sessionFiles: null,
    snapshotCache: new Map(),
  };

  const unwatchRoot = watchProviderRoot({
    rootPath,
    historyRelativePath: "history.jsonl",
    isSessionFile: (relativePath) =>
      relativePath.startsWith("projects/") && relativePath.endsWith(".jsonl"),
    onHistoryChange: () => {
      state.historyEntries = null;
      state.knownProjects = null;
    },
    onSessionFileChange: (filePath) => {
      if (!filePath) {
        state.sessionFiles = null;
        state.snapshotCache.clear();
        return;
      }
      void updateSessionFile(state, filePath, historyPath);
    },
  });

  async function listSessions(): Promise<SessionSummary[]> {
    const [historyEntries, sessionFiles] = await Promise.all([
      loadHistoryEntries(state, historyPath),
      loadSessionFiles(state, projectsDir, historyPath),
    ]);
    const seen = new Set<string>();
    const sessions: SessionSummary[] = [];

    for (const entry of historyEntries) {
      if (!entry.sessionId || seen.has(entry.sessionId)) {
        continue;
      }

      seen.add(entry.sessionId);
      const sessionFile = sessionFiles.get(entry.sessionId);
      const snapshot = sessionFile
        ? await readSnapshot(state, entry.sessionId, sessionFile)
        : null;
      const projectPath = entry.project ?? snapshot?.project ?? "";
      sessions.push({
        id: entry.sessionId,
        display:
          extractMeaningfulDisplay(entry.display ?? "") ??
          snapshot?.display ??
          "(empty)",
        timestamp: entry.timestamp ?? snapshot?.timestamp ?? 0,
        project: projectPath,
        projectName: getProjectName(projectPath),
      });
    }

    for (const [sessionId, sessionFile] of sessionFiles.entries()) {
      if (seen.has(sessionId)) {
        continue;
      }

      seen.add(sessionId);
      const snapshot = await readSnapshot(state, sessionId, sessionFile);
      sessions.push({
        id: sessionId,
        display: snapshot.display,
        timestamp: snapshot.timestamp,
        project: snapshot.project,
        projectName: getProjectName(snapshot.project),
      });
    }

    return sessions.sort((left, right) => right.timestamp - left.timestamp);
  }

  return {
    listSessions,
    destroy: unwatchRoot,
    listProjects: async () => {
      const sessions = await listSessions();
      const projects = new Set<string>();
      for (const session of sessions) {
        if (session.project) {
          projects.add(session.project);
        }
      }
      return [...projects].sort();
    },
    getConversationPage: async (
      sessionId: string,
      before: string | null,
      limit: number,
    ): Promise<ConversationPage> => {
      const sessionFiles = await loadSessionFiles(state, projectsDir, historyPath);
      const sessionFile = sessionFiles.get(sessionId);
      if (!sessionFile) {
        return { messages: [], nextBefore: null, summary: null };
      }

      const summary = await readSessionSummary(state, sessionId, sessionFile);
      if (!before) {
        return readLatestClaudeConversationPage(
          sessionFile.filePath,
          sessionId,
          limit,
          summary,
        );
      }

      const cursor = parseMessageWindowCursor(before);
      if (cursor?.kind === "tail") {
        return readTailClaudeConversationPage(
          sessionFile.filePath,
          sessionId,
          limit,
          cursor,
          summary,
        );
      }
      if (cursor?.kind === "prefix") {
        return readPrefixClaudeConversationPage(
          sessionFile.filePath,
          sessionId,
          limit,
          cursor,
          summary,
        );
      }

      const conversation = await readFullConversation(sessionFile.filePath, sessionId);
      return {
        ...paginateMessages(
          conversation.messages,
          isNumericBeforeCursor(before) ? before : null,
          limit,
        ),
        summary: conversation.summary,
      };
    },
    getSessionProjectPath: async (sessionId: string) => {
      const [historyEntries, sessionFiles] = await Promise.all([
        loadHistoryEntries(state, historyPath),
        loadSessionFiles(state, projectsDir, historyPath),
      ]);
      const historyProject = historyEntries.find(
        (entry) => entry.sessionId === sessionId,
      )?.project;
      if (historyProject) {
        return historyProject;
      }

      const sessionFile = sessionFiles.get(sessionId);
      if (!sessionFile) {
        return "";
      }
      const snapshot = await readSnapshot(state, sessionId, sessionFile);
      return snapshot.project;
    },
    deleteSession: async (sessionId: string) => {
      const sessionFiles = await loadSessionFiles(state, projectsDir, historyPath);
      const sessionFile = sessionFiles.get(sessionId);
      if (sessionFile) {
        const archivedDir = join(rootPath, "archived_sessions");
        await mkdir(archivedDir, { recursive: true });
        const fileName = sessionFile.filePath.split("/").pop() ?? `${sessionId}.jsonl`;
        await rename(sessionFile.filePath, join(archivedDir, fileName));
      }
      try {
        const raw = await readFile(historyPath, "utf-8");
        const filtered = raw
          .split("\n")
          .filter((line) => {
            if (!line.trim()) return false;
            try {
              const parsed = JSON.parse(line) as { sessionId?: string };
              return parsed.sessionId !== sessionId;
            } catch {
              return true;
            }
          })
          .join("\n");
        await writeFile(historyPath, filtered + "\n", "utf-8");
      } catch {
        // history removal is best-effort
      }
      state.sessionFiles = null;
      state.historyEntries = null;
      state.knownProjects = null;
      state.snapshotCache.delete(sessionId);
    },
  };
}

async function loadHistoryEntries(
  state: ClaudeStoreState,
  historyPath: string,
): Promise<ClaudeHistoryEntry[]> {
  if (!state.historyEntries) {
    state.historyEntries = await readClaudeHistoryEntries(historyPath);
    state.knownProjects = buildKnownProjects(state.historyEntries);
  }
  return state.historyEntries;
}

async function loadSessionFiles(
  state: ClaudeStoreState,
  projectsDir: string,
  historyPath: string,
): Promise<Map<string, ClaudeSessionFile>> {
  if (!state.sessionFiles) {
    const historyEntries = await loadHistoryEntries(state, historyPath);
    state.sessionFiles = await readClaudeSessionFiles(
      projectsDir,
      state.knownProjects ?? buildKnownProjects(historyEntries),
    );
  }
  return state.sessionFiles;
}

function buildKnownProjects(
  historyEntries: ClaudeHistoryEntry[],
): Map<string, string> {
  const knownProjects = new Map<string, string>();
  for (const entry of historyEntries) {
    if (entry.project) {
      knownProjects.set(encodeProjectPath(entry.project), entry.project);
    }
  }
  return knownProjects;
}

async function updateSessionFile(
  state: ClaudeStoreState,
  filePath: string,
  historyPath: string,
): Promise<void> {
  if (!state.sessionFiles) {
    return;
  }

  const historyEntries = await loadHistoryEntries(state, historyPath);
  const knownProjects = state.knownProjects ?? buildKnownProjects(historyEntries);
  const sessionFile = toClaudeSessionFile(filePath, knownProjects);
  const sessionId = filePath.split("/").pop()?.replace(/\.jsonl$/, "") ?? "";
  if (!sessionId) {
    return;
  }

  state.sessionFiles.set(sessionId, sessionFile);
  state.snapshotCache.delete(sessionId);
}

async function readSnapshot(
  state: ClaudeStoreState,
  sessionId: string,
  sessionFile: ClaudeSessionFile,
): Promise<ClaudeSessionSnapshot> {
  const cached = state.snapshotCache.get(sessionId);
  if (cached) {
    return cached;
  }

  const snapshot = await readClaudeSessionSnapshot(sessionFile);
  state.snapshotCache.set(sessionId, snapshot);
  return snapshot;
}

async function readSessionSummary(
  state: ClaudeStoreState,
  sessionId: string,
  sessionFile: ClaudeSessionFile,
) {
  const snapshot = await readSnapshot(state, sessionId, sessionFile);
  return snapshot.summary
    ? {
        id: `${sessionId}:summary`,
        role: "system" as const,
        kind: "summary" as const,
        text: snapshot.summary,
      }
    : null;
}

async function readFullConversation(filePath: string, sessionId: string) {
  const lines = await readJsonLinesWithOffsets(filePath);
  return parseClaudeConversationEntries(lines, sessionId);
}
