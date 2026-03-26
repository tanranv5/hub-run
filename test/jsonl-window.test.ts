import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { readJsonLinesFromOffset } from "../api/providers/jsonl-window";

test("readJsonLinesFromOffset respects an explicit snapshot end offset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hub-run-jsonl-"));
  const filePath = join(directory, "conversation.jsonl");
  const firstLine = '{"type":"message","text":"first"}';
  const secondLine = '{"type":"message","text":"second"}';
  await writeFile(filePath, `${firstLine}\n${secondLine}\n`, "utf-8");

  try {
    const firstSnapshotEnd = Buffer.byteLength(`${firstLine}\n`, "utf-8");
    const lines = await readJsonLinesFromOffset(filePath, 0, firstSnapshotEnd);

    assert.deepEqual(lines, [{ line: firstLine, offset: 0 }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
