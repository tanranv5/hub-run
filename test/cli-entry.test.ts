import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("CLI entry declares a node shebang for direct execution", () => {
  const source = readFileSync(resolve("api/index.ts"), "utf-8");
  assert.match(source, /^#!\/usr\/bin\/env node/);
});
