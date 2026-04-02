import assert from "node:assert/strict";
import test from "node:test";
import type { SessionSummary } from "../api/types";
import {
  clearSelectedSessionPreference,
  mergePreferredSession,
  readConversationReadingPreference,
  readProviderControlPreference,
  readSelectedSessionPreference,
  writeConversationReadingPreference,
  writeProviderControlPreference,
  writeSelectedSessionPreference,
} from "../web/ui-preferences";

const SESSION: SessionSummary = {
  id: "session-9",
  display: "恢复到上次会话",
  timestamp: 1770000000000,
  project: "/workspace/app",
  projectName: "app",
};

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test("selected session preference round-trips by provider and project", () => {
  const storage = createStorage();

  writeSelectedSessionPreference(storage, "codex", SESSION.project, SESSION);

  assert.deepEqual(
    readSelectedSessionPreference(storage, "codex", SESSION.project),
    SESSION,
  );
  assert.deepEqual(
    readSelectedSessionPreference(storage, "codex", null),
    SESSION,
  );
  assert.equal(
    readSelectedSessionPreference(storage, "codex", "/workspace/other"),
    null,
  );
});

test("selected session preference falls back to latest provider session when only project-specific cache exists", () => {
  const storage = createStorage();
  const olderSession = {
    ...SESSION,
    id: "session-8",
    timestamp: SESSION.timestamp - 10,
  };

  storage.setItem(
    "hub-run:selected-session:v1:codex:/workspace/older",
    JSON.stringify(olderSession),
  );
  storage.setItem(
    "hub-run:selected-session:v1:codex:/workspace/newer",
    JSON.stringify(SESSION),
  );

  assert.deepEqual(readSelectedSessionPreference(storage, "codex", null), SESSION);
});

test("provider control preference round-trips selected model and effort", () => {
  const storage = createStorage();

  writeProviderControlPreference(storage, "codex", {
    effort: "high",
    modelId: "gpt-5.4",
  });

  assert.deepEqual(readProviderControlPreference(storage, "codex"), {
    effort: "high",
    modelId: "gpt-5.4",
  });
  assert.equal(readProviderControlPreference(storage, "claude"), null);
});

test("conversation reading preference round-trips mode, font scale, and composer height", () => {
  const storage = createStorage();

  writeConversationReadingPreference(storage, {
    composerStoredHeight: 188,
    messageFontScale: 3,
    messageViewMode: "compact",
  });

  assert.deepEqual(readConversationReadingPreference(storage), {
    composerStoredHeight: 188,
    messageFontScale: 3,
    messageViewMode: "compact",
  });
});

test("preferred session is merged back into the latest window when it is missing", () => {
  const merged = mergePreferredSession(
    [
      {
        ...SESSION,
        id: "session-10",
        timestamp: SESSION.timestamp + 1000,
      },
    ],
    SESSION,
  );

  assert.deepEqual(
    merged.map((session) => session.id),
    ["session-10", "session-9"],
  );
});

test("clearing a deleted selected session removes provider-wide and project-specific cache", () => {
  const storage = createStorage();
  const otherProjectSession = {
    ...SESSION,
    id: "session-10",
    project: "/workspace/other",
    projectName: "other",
    timestamp: SESSION.timestamp - 10,
  };

  writeSelectedSessionPreference(storage, "claude", SESSION.project, SESSION);
  writeSelectedSessionPreference(storage, "claude", otherProjectSession.project, otherProjectSession);

  clearSelectedSessionPreference(storage, "claude", SESSION.id);

  assert.equal(readSelectedSessionPreference(storage, "claude", SESSION.project), null);
  assert.deepEqual(
    readSelectedSessionPreference(storage, "claude", otherProjectSession.project),
    otherProjectSession,
  );
});
