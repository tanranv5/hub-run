import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  readJsonHeadWindowFromOffset,
  readJsonLinesFromOffset,
  readJsonTailWindowBeforeOffset,
} from "../api/providers/jsonl-window";

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

test("readJsonTailWindowBeforeOffset only returns complete lines before the anchor offset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hub-run-jsonl-"));
  const filePath = join(directory, "conversation-before.jsonl");
  const lines = [
    '{"type":"message","text":"first"}',
    '{"type":"message","text":"second"}',
    '{"type":"message","text":"third"}',
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const endOffset = Buffer.byteLength(`${lines[0]}\n${lines[1]}\n`, "utf-8");
    const window = await readJsonTailWindowBeforeOffset(filePath, endOffset, 1);

    assert.equal(window.exhausted, true);
    assert.deepEqual(window.lines.map((line) => line.line), [lines[0], lines[1]]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("readJsonHeadWindowFromOffset drops an incomplete trailing line until the window expands", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hub-run-jsonl-"));
  const filePath = join(directory, "conversation-head.jsonl");
  const largeThirdPayload = "x".repeat(700);
  const lines = [
    '{"type":"message","text":"first"}',
    '{"type":"message","text":"second"}',
    `{"type":"message","text":"${largeThirdPayload}"}`,
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");

  try {
    const startOffset = Buffer.byteLength(`${lines[0]}\n`, "utf-8");
    const window = await readJsonHeadWindowFromOffset(filePath, startOffset, 1, 8);

    assert.equal(window.lines[0]?.line, lines[1]);
    assert.equal(
      window.lines.some((line) => line.line.includes(largeThirdPayload.slice(0, 32))),
      false,
    );
    assert.equal(window.exhausted, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
