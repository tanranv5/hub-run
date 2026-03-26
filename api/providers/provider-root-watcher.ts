import { existsSync, watch, type FSWatcher } from "fs";
import { join } from "path";

interface ProviderRootWatchOptions {
  rootPath: string;
  historyRelativePath: string;
  isSessionFile: (relativePath: string) => boolean;
  onHistoryChange: () => void;
  onSessionFileChange: (filePath: string | null) => void;
}

interface WatchListener {
  historyRelativePath: string;
  isSessionFile: (relativePath: string) => boolean;
  onHistoryChange: () => void;
  onSessionFileChange: (filePath: string | null) => void;
}

interface WatchEntry {
  watcher: FSWatcher;
  listeners: Set<WatchListener>;
  debounceTimers: Map<string, NodeJS.Timeout>;
}

const entries = new Map<string, WatchEntry>();
const DEBOUNCE_MS = 25;

export function watchProviderRoot(options: ProviderRootWatchOptions): () => void {
  if (!existsSync(options.rootPath)) {
    return () => {};
  }

  const key = options.rootPath;
  let entry = entries.get(key);
  if (!entry) {
    entry = createWatchEntry(options.rootPath);
    entries.set(key, entry);
  }

  const listener: WatchListener = {
    historyRelativePath: normalizeRelativePath(options.historyRelativePath),
    isSessionFile: options.isSessionFile,
    onHistoryChange: options.onHistoryChange,
    onSessionFileChange: options.onSessionFileChange,
  };
  entry.listeners.add(listener);

  return () => {
    const current = entries.get(key);
    if (!current) {
      return;
    }

    current.listeners.delete(listener);
    if (current.listeners.size > 0) {
      return;
    }

    current.watcher.close();
    for (const timer of current.debounceTimers.values()) {
      clearTimeout(timer);
    }
    entries.delete(key);
  };
}

function createWatchEntry(rootPath: string): WatchEntry {
  const watcher = watch(
    rootPath,
    {
      persistent: false,
      recursive: true,
    },
    (eventType, filename) => {
      const entry = entries.get(rootPath);
      if (!entry) {
        return;
      }

      const relativePath = filename ? normalizeRelativePath(String(filename)) : "*";
      const existing = entry.debounceTimers.get(relativePath);
      if (existing) {
        clearTimeout(existing);
      }

      const timer = setTimeout(() => {
        entry.debounceTimers.delete(relativePath);
        notifyListeners(rootPath, entry.listeners, relativePath, eventType);
      }, DEBOUNCE_MS);

      entry.debounceTimers.set(relativePath, timer);
    },
  );

  watcher.on("error", (error) => {
    console.error("Provider watcher error:", error);
    const current = entries.get(rootPath);
    if (!current || current.watcher !== watcher) {
      return;
    }
    current.watcher.close();
    for (const timer of current.debounceTimers.values()) {
      clearTimeout(timer);
    }
    for (const listener of current.listeners) {
      listener.onHistoryChange();
      listener.onSessionFileChange(null);
    }
    entries.delete(rootPath);
  });

  return {
    watcher,
    listeners: new Set(),
    debounceTimers: new Map(),
  };
}

function notifyListeners(
  rootPath: string,
  listeners: Set<WatchListener>,
  relativePath: string,
  eventType: string,
) {
  if (relativePath === "*") {
    for (const listener of listeners) {
      listener.onHistoryChange();
      listener.onSessionFileChange(null);
    }
    return;
  }

  const normalized = normalizeRelativePath(relativePath);
  for (const listener of listeners) {
    if (normalized === listener.historyRelativePath) {
      listener.onHistoryChange();
      continue;
    }

    if (!listener.isSessionFile(normalized)) {
      continue;
    }

    if (eventType === "rename" && !existsSync(join(rootPath, normalized))) {
      listener.onSessionFileChange(null);
      continue;
    }

    listener.onSessionFileChange(join(rootPath, normalized));
  }
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "");
}
