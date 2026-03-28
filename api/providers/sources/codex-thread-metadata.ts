import { existsSync } from "fs";
import { createRequire } from "node:module";

interface CodexThreadRow {
  id: string;
  source: string;
  agent_role: string | null;
}

interface DatabaseSyncLike {
  close(): void;
  prepare(sql: string): {
    all(parameter: string): unknown[];
  };
}

interface DatabaseSyncConstructor {
  new (
    path: string,
    options?: {
      readOnly?: boolean;
      timeout?: number;
    },
  ): DatabaseSyncLike;
}

const SUBAGENT_SOURCE_PREFIX = '{"subagent"';
const STATE_DB_BUSY_TIMEOUT_MS = 1_000;
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: DatabaseSyncConstructor;
};

export function readHiddenCodexSessionIds(
  stateDbPath: string,
  databaseCtor: DatabaseSyncConstructor = DatabaseSync,
): Set<string> {
  if (!existsSync(stateDbPath)) {
    return new Set();
  }

  const database = new databaseCtor(stateDbPath, {
    readOnly: true,
    timeout: STATE_DB_BUSY_TIMEOUT_MS,
  });
  try {
    const rows = database
      .prepare(
        "select id, source, agent_role from threads where agent_role is not null or source like ?",
      )
      .all(`${SUBAGENT_SOURCE_PREFIX}%`) as unknown as CodexThreadRow[];
    return new Set(rows.filter(isHiddenCodexThread).map((row) => row.id));
  } finally {
    database.close();
  }
}

function isHiddenCodexThread(row: CodexThreadRow): boolean {
  return hasAgentRole(row.agent_role) || isSubagentSource(row.source);
}

function hasAgentRole(agentRole: string | null): boolean {
  return typeof agentRole === "string" && agentRole.trim().length > 0;
}

function isSubagentSource(source: string): boolean {
  return source.trim().startsWith(SUBAGENT_SOURCE_PREFIX);
}
