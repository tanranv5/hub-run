import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readHiddenCodexSessionIds } from "../api/providers/sources/codex-thread-metadata";

test("readHiddenCodexSessionIds opens the sqlite state db with a busy timeout", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "hub-run-codex-thread-metadata-"));
  const stateDbPath = join(tempDir, "state_5.sqlite");
  writeFileSync(stateDbPath, "");
  const calls: Array<{
    options: {
      readOnly?: boolean;
      timeout?: number;
    };
    path: string;
  }> = [];

  class FakeDatabase {
    constructor(
      path: string,
      options: {
        readOnly?: boolean;
        timeout?: number;
      } = {},
    ) {
      calls.push({ path, options });
    }

    close() {}

    prepare() {
      return {
        all: () => [],
      };
    }
  }

  readHiddenCodexSessionIds(
    stateDbPath,
    FakeDatabase as unknown as {
      new (
        path: string,
        options?: {
          readOnly?: boolean;
          timeout?: number;
        },
      ): {
        close(): void;
        prepare(sql: string): {
          all(parameter: string): unknown[];
        };
      };
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, stateDbPath);
  assert.equal(calls[0]?.options.readOnly, true);
  assert.equal(calls[0]?.options.timeout, 1_000);
});
