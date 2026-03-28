import { stat } from "fs/promises";
import { join } from "path";
import type { ConversationPage, SessionSummary } from "../../types";
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
  displayCache: Map<string, string>;
}

const HIDDEN_DISPLAY_VALUES = new Set(["(no prompt text)", "(empty)"]);

export function createCodexSessionStore(rootPath: string) {
  const historyPath = join(rootPath, "history.jsonl");
  const sessionsDir = join(rootPath, "sessions");
  const stateDbPath = join(rootPath, "state_5.sqlite");
  const state: CodexStoreState = {
    historyCache: null,
    sessionFiles: null,
    displayCache: new Map(),
  };

  const unwatchRoot = watchProviderRoot({
    rootPath,
    historyRelativePath: "history.jsonl",
    isSessionFile: (relativePath) =>
      relativePath.startsWith("sessions/") && relativePath.endsWith(".jsonl"),
    onHistoryChange: () => {
      state.historyCache = null;
    },
    onSessionFileChange: (filePath) => {
      if (!filePath) {
        state.sessionFiles = null;
        state.displayCache.clear();
        return;
      }
      void updateSessionFile(state, filePath);
    },
  });

  async function listSessions(): Promise<SessionSummary[]> {
    const [history, sessionFiles] = await Promise.all([
      loadHistory(state, historyPath),
      loadSessionFiles(state, sessionsDir),
    ]);
    const hiddenSessionIds = readHiddenCodexSessionIds(stateDbPath);
    const sessionIds = new Set<string>([...history.keys(), ...sessionFiles.keys()]);
    const sessions = await Promise.all(
      [...sessionIds]
        .filter((sessionId) => !hiddenSessionIds.has(sessionId))
        .map(async (sessionId) => {
        const sessionFile = sessionFiles.get(sessionId);
        const historyEntry = history.get(sessionId);
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
        }),
    );

    return sessions
      .filter((session) => isVisibleCodexSession(session.display))
      .sort((left, right) => right.timestamp - left.timestamp);
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
      const sessionFiles = await loadSessionFiles(state, sessionsDir);
      const filePath = sessionFiles.get(sessionId)?.filePath;
      if (!filePath) {
        return { messages: [], nextBefore: null, summary: null };
      }

      if (!before) {
        return readLatestCodexConversationPage(filePath, sessionId, limit);
      }

      const cursor = parseMessageWindowCursor(before);
      if (cursor?.kind === "tail") {
        return readTailCodexConversationPage(filePath, sessionId, limit, cursor);
      }
      if (cursor?.kind === "prefix") {
        return readPrefixCodexConversationPage(filePath, sessionId, limit, cursor);
      }

      const messages = await readCodexConversation(filePath, sessionId);
      return {
        ...paginateMessages(
          messages,
          isNumericBeforeCursor(before) ? before : null,
          limit,
        ),
        summary: null,
      };
    },
    getSessionCwd: async (sessionId: string) => {
      const sessionFiles = await loadSessionFiles(state, sessionsDir);
      return sessionFiles.get(sessionId)?.meta?.cwd;
    },
    getSessionContext: async (sessionId: string) => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      return readCodexSessionContext(filePath, sessionId);
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
    getConversationStream: async (sessionId: string, offset: number) => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      if (!filePath) {
        return { messages: [], nextOffset: 0 };
      }

      const lines = await readJsonLinesFromOffset(filePath, offset);
      const safeNextOffset = lines.length > 0
        ? lines[lines.length - 1].offset + Buffer.byteLength(lines[lines.length - 1].line, "utf-8") + 1
        : offset;
      return {
        messages: readCodexConversationEntries(lines, sessionId),
        nextOffset: safeNextOffset,
      };
    },
    getConversationStreamCursor: async (sessionId: string) => {
      const filePath = await getSessionFilePath(state, sessionsDir, sessionId);
      return filePath ? readFileSize(filePath) : 0;
    },
  };
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
  const sessionFiles = await loadSessionFiles(state, sessionsDir);
  return sessionFiles.get(sessionId)?.filePath ?? null;
}

async function readFileSize(filePath: string): Promise<number> {
  return stat(filePath)
    .then((result) => result.size)
    .catch(() => 0);
}

async function updateSessionFile(
  state: CodexStoreState,
  filePath: string,
): Promise<void> {
  if (!state.sessionFiles) {
    return;
  }

  const meta = await readCodexSessionMeta(filePath);
  const sessionId = meta?.id ?? fallbackCodexSessionIdFromFileName(filePath);

  for (const [key, value] of state.sessionFiles.entries()) {
    if (value.filePath === filePath || key === sessionId) {
      state.sessionFiles.delete(key);
      state.displayCache.delete(key);
    }
  }

  state.sessionFiles.set(sessionId, { filePath, meta });
  state.displayCache.delete(sessionId);
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
