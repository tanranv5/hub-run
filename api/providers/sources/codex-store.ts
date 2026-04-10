import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import { join } from "path";
import {
  filterConversationMessages,
  locateConversationMessages,
  searchConversationMessages,
} from "../../conversation-search";
import type {
  ConversationAnchor,
  ConversationLocateResult,
  ConversationContextResult,
  ConversationPage,
  ConversationSearchPageResult,
  ConversationSearchMode,
  ConversationSearchResult,
  SessionSummary,
} from "../../types";
import {
  isNumericBeforeCursor,
  parseMessageWindowCursor,
  readJsonLinesFromOffset,
} from "../jsonl-window";
import { watchProviderRoot } from "../provider-root-watcher";
import {
  extractMeaningfulDisplay,
  getProjectName,
  paginateMessages,
  readJsonLines,
  safeJsonParse,
} from "../shared";
import {
  findCodexSessionFilePath,
  fallbackCodexSessionIdFromFileName,
  readCodexConversation,
  readCodexConversationEntries,
  readCodexFirstUserSnippet,
  readCodexSessionFiles,
  readCodexSessionMeta,
  type CodexSessionFile,
} from "./codex-session-files";
import {
  readLatestCodexConversationPage,
  readPrefixCodexConversationPage,
  readTailCodexConversationPage,
} from "./codex-conversation-pages";
import { readConversationContextWindow as readContextWindow } from "./conversation-context-window";
import { readConversationSearchPage } from "./conversation-search-page";
import { readCodexSessionContext } from "./codex-session-context";
import { readHiddenCodexSessionIds } from "./codex-thread-metadata";

interface CodexHistoryEntry {
  session_id?: string;
  ts?: number;
  text?: string;
}

interface CodexStoreState {
  historyCache: Map<string, CodexHistoryEntry> | null;
  sessionFiles: Map<string, CodexSessionFile> | null;
  sessionListCache: SessionSummary[] | null;
  sessionListPromise: Promise<SessionSummary[]> | null;
  sessionDirectoryHints: Map<string, string>;
  sessionFileHints: Map<string, string>;
  displayCache: Map<string, string>;
  deletedSessionIds: Set<string>;
}

const HIDDEN_DISPLAY_VALUES = new Set(["(no prompt text)", "(empty)"]);

export function createCodexSessionStore(rootPath: string) {
  const historyPath = join(rootPath, "history.jsonl");
  const sessionsDir = join(rootPath, "sessions");
  const stateDbPath = join(rootPath, "state_5.sqlite");
  const state: CodexStoreState = {
    historyCache: null,
    sessionFiles: null,
    sessionListCache: null,
    sessionListPromise: null,
    sessionDirectoryHints: new Map(),
    sessionFileHints: new Map(),
    displayCache: new Map(),
    deletedSessionIds: new Set(),
  };

  const unwatchRoot = watchProviderRoot({
    rootPath,
    historyRelativePath: "history.jsonl",
    isSessionFile: (relativePath) =>
      relativePath.startsWith("sessions/") && relativePath.endsWith(".jsonl"),
    onHistoryChange: () => {
      state.historyCache = null;
      invalidateSessionList(state);
    },
    onSessionFileChange: (filePath) => {
      if (!filePath) {
        state.sessionFiles = null;
        state.sessionFileHints.clear();
        state.displayCache.clear();
        invalidateSessionList(state);
        return;
      }
      void updateSessionFile(state, rootPath, filePath);
    },
  });

  async function listSessions(): Promise<SessionSummary[]> {
    return loadVisibleSessions(state, historyPath, sessionsDir, stateDbPath);
  }

  return {
    listSessions,
    destroy: unwatchRoot,
    rememberSessionDirectoryHint: (sessionId: string, timestampMs = Date.now()) => {
      state.sessionDirectoryHints.set(sessionId, buildCodexSessionDirectory(rootPath, timestampMs));
    },
    listProjects: async () => {
      const sessions = await loadVisibleSessions(
        state,
        historyPath,
        sessionsDir,
        stateDbPath,
      );
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
      mode: ConversationSearchMode = "all",
    ): Promise<ConversationPage> => {
      const sessionFiles = await loadSessionFiles(state, sessionsDir);
      const filePath = sessionFiles.get(sessionId)?.filePath;
      if (!filePath) {
        return { messages: [], nextBefore: null, summary: null };
      }

      if (!before) {
        return readLatestCodexConversationPage(filePath, sessionId, limit, mode);
      }

      const cursor = parseMessageWindowCursor(before);
      if (cursor?.kind === "tail") {
        return readTailCodexConversationPage(filePath, sessionId, limit, cursor, mode);
      }
      if (cursor?.kind === "prefix") {
        return readPrefixCodexConversationPage(filePath, sessionId, limit, cursor, mode);
      }

      const messages = filterByMode(await readCodexConversation(filePath, sessionId), mode);
      return {
        ...paginateMessages(
          messages,
          isNumericBeforeCursor(before) ? before : null,
          limit,
        ),
        summary: null,
      };
    },
    searchConversation: async (
      sessionId: string,
      query: string,
      mode: ConversationSearchMode,
      recentLimit?: number | null,
    ): Promise<ConversationSearchResult> => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      if (!filePath) {
        return searchConversationMessages({ messages: [], mode, query, recentLimit });
      }
      return searchConversationMessages({
        messages: await readCodexConversation(filePath, sessionId),
        mode,
        query,
        recentLimit,
      });
    },
    searchConversationPage: async (
      sessionId: string,
      query: string,
      mode: ConversationSearchMode,
      anchor: ConversationAnchor | null,
      limit: number,
      recentLimit?: number | null,
    ): Promise<ConversationSearchPageResult> => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      if (!filePath) {
        return {
          query: query.trim(),
          mode,
          totalHits: 0,
          hits: [],
          nextAnchor: null,
        };
      }
      return readConversationSearchPage({
        anchor,
        filePath,
        limit,
        mode,
        parseMessages: (lines) => readCodexConversationEntries(lines, sessionId),
        query,
        recentLimit,
      });
    },
    locateConversation: async (
      sessionId: string,
      messageId: string,
      mode: ConversationSearchMode,
      window: number,
    ): Promise<ConversationLocateResult | null> => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      if (!filePath) {
        return null;
      }
      return locateConversationMessages({
        messageId,
        messages: await readCodexConversation(filePath, sessionId),
        mode,
        window,
      });
    },
    readConversationContext: async (
      sessionId: string,
      anchor: ConversationAnchor,
      mode: ConversationSearchMode,
      window: number,
    ): Promise<ConversationContextResult | null> => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      if (!filePath) {
        return null;
      }
      return readContextWindow({
        anchor,
        filePath,
        mode,
        parseMessages: (lines) => readCodexConversationEntries(lines, sessionId),
        window,
      });
    },
    getSessionCwd: async (sessionId: string) => {
      const sessionFiles = await loadSessionFiles(state, sessionsDir);
      return sessionFiles.get(sessionId)?.meta?.cwd;
    },
    getSessionContext: async (sessionId: string) => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      return readCodexSessionContext(filePath, sessionId);
    },
    getSessionFileMtime: async (sessionId: string) => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      if (!filePath) return null;
      return stat(filePath).then((s) => s.mtimeMs).catch(() => null);
    },
    deleteSession: async (sessionId: string) => {
      const filePath = await getSessionFilePathForDelete(state, sessionsDir, sessionId);
      if (filePath) {
        await archiveSessionFile(rootPath, sessionId, filePath);
      }
      // Remove from history.jsonl regardless of file existence
      try {
        const raw = await readFile(historyPath, "utf-8");
        const filtered = raw
          .split("\n")
          .filter((line) => {
            if (!line.trim()) return false;
            try {
              const parsed = JSON.parse(line) as { session_id?: string };
              return parsed.session_id !== sessionId;
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
      state.historyCache = null;
      state.sessionFileHints.delete(sessionId);
      state.displayCache.delete(sessionId);
      state.deletedSessionIds.add(sessionId);
      invalidateSessionList(state);
    },
    subscribeSessions: (onChange: () => void) =>
      watchProviderRoot({
        rootPath,
        historyRelativePath: "history.jsonl",
        isSessionFile: isCodexSessionIndexPath,
        onHistoryChange: onChange,
        onSessionFileChange: () => {
          onChange();
        },
      }),
    subscribeConversation: (sessionId: string, onChange: () => void) =>
      watchProviderRoot({
        rootPath,
        historyRelativePath: "history.jsonl",
        isSessionFile: (relativePath) =>
          relativePath.startsWith("sessions/") && relativePath.endsWith(".jsonl"),
        onHistoryChange: () => {},
        onSessionFileChange: (filePath) => {
          if (filePath?.endsWith(`${sessionId}.jsonl`)) {
            onChange();
          }
        },
      }),
    getConversationStream: async (
      sessionId: string,
      offset: number,
      mode: ConversationSearchMode = "all",
    ) => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      if (!filePath) {
        return { messages: [], nextOffset: 0 };
      }

      const lines = await readJsonLinesFromOffset(filePath, offset);
      const safeNextOffset = lines.length > 0
        ? lines[lines.length - 1].offset + Buffer.byteLength(lines[lines.length - 1].line, "utf-8") + 1
        : offset;
      return {
        messages: filterByMode(readCodexConversationEntries(lines, sessionId), mode),
        nextOffset: safeNextOffset,
      };
    },
    getConversationStreamCursor: async (sessionId: string) => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      return filePath ? readFileSize(filePath) : 0;
    },
  };
}

function filterByMode(
  messages: ConversationPage["messages"],
  mode: ConversationSearchMode,
) {
  return mode === "all" ? messages : filterConversationMessages(messages, mode);
}

function readSessionTimestamp(
  sessionFile: CodexSessionFile | undefined,
  historyEntry: CodexHistoryEntry | undefined,
): number {
  if (typeof historyEntry?.ts === "number" && Number.isFinite(historyEntry.ts)) {
    return historyEntry.ts * 1000;
  }
  return sessionFile?.meta?.timestamp ?? 0;
}

async function readSessionDisplay(
  state: CodexStoreState,
  sessionId: string,
  sessionFile: CodexSessionFile | undefined,
  historyEntry: CodexHistoryEntry | undefined,
): Promise<string> {
  const cached = state.displayCache.get(sessionId);
  if (cached) {
    return cached;
  }

  const display = sessionFile?.filePath
    ? await readCodexFirstUserSnippet(sessionFile.filePath)
    : extractMeaningfulDisplay(historyEntry?.text ?? "") ?? "(no prompt text)";
  state.displayCache.set(sessionId, display);
  return display;
}

async function loadHistory(
  state: CodexStoreState,
  historyPath: string,
): Promise<Map<string, CodexHistoryEntry>> {
  if (state.historyCache) {
    return state.historyCache;
  }

  const lines = await readJsonLines(historyPath);
  const cache = new Map<string, CodexHistoryEntry>();
  for (const line of lines) {
    const parsed = safeJsonParse<CodexHistoryEntry>(line);
    if (!parsed?.session_id) {
      continue;
    }
    cache.set(parsed.session_id, parsed);
  }

  state.historyCache = cache;
  return cache;
}

async function loadSessionFiles(
  state: CodexStoreState,
  sessionsDir: string,
): Promise<Map<string, CodexSessionFile>> {
  if (!state.sessionFiles) {
    state.sessionFiles = await readCodexSessionFiles(sessionsDir);
  }
  return state.sessionFiles;
}

async function getSessionFilePath(
  state: CodexStoreState,
  sessionsDir: string,
  sessionId: string,
) {
  const hintedPath = state.sessionFileHints.get(sessionId);
  if (hintedPath) {
    return hintedPath;
  }

  const cachedPath = state.sessionFiles?.get(sessionId)?.filePath;
  if (cachedPath) {
    return cachedPath;
  }

  const targetedPath = await findCodexSessionFilePath(sessionsDir, sessionId);
  if (targetedPath) {
    state.sessionFileHints.set(sessionId, targetedPath);
    return targetedPath;
  }

  if (state.sessionFiles) {
    return null;
  }

  const sessionFiles = await loadSessionFiles(state, sessionsDir);
  return sessionFiles.get(sessionId)?.filePath ?? null;
}

async function getSessionFilePathForDelete(
  state: CodexStoreState,
  sessionsDir: string,
  sessionId: string,
): Promise<string | null> {
  const hintedPath = state.sessionFileHints.get(sessionId);
  if (hintedPath) {
    return hintedPath;
  }

  const cachedPath = state.sessionFiles?.get(sessionId)?.filePath;
  if (cachedPath) {
    return cachedPath;
  }

  const hintedDirectory = state.sessionDirectoryHints.get(sessionId);
  if (hintedDirectory) {
    return findCodexSessionFilePath(hintedDirectory, sessionId);
  }

  return findCodexSessionFilePath(sessionsDir, sessionId);
}

async function readFileSize(filePath: string): Promise<number> {
  return stat(filePath)
    .then((result) => result.size)
    .catch(() => 0);
}

async function updateSessionFile(
  state: CodexStoreState,
  rootPath: string,
  filePath: string,
): Promise<void> {
  const meta = await readCodexSessionMeta(filePath);
  const sessionId = meta?.id ?? fallbackCodexSessionIdFromFileName(filePath);
  removeSessionFileFromCache(state, filePath, sessionId);
  state.sessionFileHints.set(sessionId, filePath);

  if (state.deletedSessionIds.has(sessionId)) {
    await archiveSessionFile(rootPath, sessionId, filePath);
    state.sessionDirectoryHints.delete(sessionId);
    state.sessionFileHints.delete(sessionId);
    invalidateSessionList(state);
    return;
  }

  if (!state.sessionFiles) {
    invalidateSessionList(state);
    return;
  }

  state.sessionFiles.set(sessionId, { filePath, meta });
  state.sessionDirectoryHints.delete(sessionId);
  state.displayCache.delete(sessionId);
  invalidateSessionList(state);
}

function removeSessionFileFromCache(
  state: CodexStoreState,
  filePath: string,
  sessionId: string,
): void {
  if (!state.sessionFiles) {
    return;
  }

  for (const [key, value] of state.sessionFiles.entries()) {
    if (value.filePath === filePath || key === sessionId) {
      state.sessionFiles.delete(key);
      state.displayCache.delete(key);
    }
  }
}

async function archiveSessionFile(
  rootPath: string,
  sessionId: string,
  filePath: string,
): Promise<void> {
  const archivedDir = join(rootPath, "archived_sessions");
  await mkdir(archivedDir, { recursive: true });
  const fileName = filePath.split("/").pop() ?? `${sessionId}.jsonl`;
  await rename(filePath, join(archivedDir, fileName)).catch(() => {});
}

function isCodexSessionIndexPath(relativePath: string): boolean {
  return isCodexSessionFile(relativePath) || isCodexStateFile(relativePath);
}

function isCodexSessionFile(relativePath: string): boolean {
  return relativePath.startsWith("sessions/") && relativePath.endsWith(".jsonl");
}

function isCodexStateFile(relativePath: string): boolean {
  return (
    relativePath === "state_5.sqlite" ||
    relativePath === "state_5.sqlite-wal" ||
    relativePath === "state_5.sqlite-shm"
  );
}

function isVisibleCodexSession(display: string): boolean {
  return !HIDDEN_DISPLAY_VALUES.has(display.trim());
}

async function loadVisibleSessions(
  state: CodexStoreState,
  historyPath: string,
  sessionsDir: string,
  stateDbPath: string,
): Promise<SessionSummary[]> {
  if (state.sessionListCache) {
    return state.sessionListCache;
  }
  if (state.sessionListPromise) {
    return state.sessionListPromise;
  }

  state.sessionListPromise = buildVisibleSessions(state, historyPath, sessionsDir, stateDbPath)
    .then((sessions) => {
      state.sessionListCache = sessions;
      return sessions;
    })
    .finally(() => {
      state.sessionListPromise = null;
    });
  return state.sessionListPromise;
}

async function buildVisibleSessions(
  state: CodexStoreState,
  historyPath: string,
  sessionsDir: string,
  stateDbPath: string,
): Promise<SessionSummary[]> {
  const [history, sessionFiles] = await Promise.all([
    loadHistory(state, historyPath),
    loadSessionFiles(state, sessionsDir),
  ]);
  const hiddenSessionIds = readHiddenCodexSessionIds(stateDbPath);
  const sessionIds = [...new Set<string>([...history.keys(), ...sessionFiles.keys()])];
  const sessions = await Promise.all(
    sessionIds
      .filter((sessionId) => !hiddenSessionIds.has(sessionId) && !state.deletedSessionIds.has(sessionId))
      .map((sessionId) => buildSessionSummary(state, sessionId, sessionFiles.get(sessionId), history.get(sessionId))),
  );
  return sessions
    .filter((session) => isVisibleCodexSession(session.display))
    .sort((left, right) => right.timestamp - left.timestamp);
}

async function buildSessionSummary(
  state: CodexStoreState,
  sessionId: string,
  sessionFile: CodexSessionFile | undefined,
  historyEntry: CodexHistoryEntry | undefined,
): Promise<SessionSummary> {
  const cwd = sessionFile?.meta?.cwd ?? "";
  return {
    id: sessionId,
    display: await readSessionDisplay(
      state,
      sessionId,
      sessionFile,
      historyEntry,
    ),
    timestamp: readSessionTimestamp(sessionFile, historyEntry),
    project: cwd,
    projectName: getProjectName(cwd),
  } satisfies SessionSummary;
}

function invalidateSessionList(state: CodexStoreState): void {
  state.sessionListCache = null;
  state.sessionListPromise = null;
}

function buildCodexSessionDirectory(rootPath: string, timestampMs: number): string {
  const current = new Date(timestampMs);
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  return join(rootPath, "sessions", String(year), month, day);
}
