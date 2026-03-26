#!/usr/bin/env node

import { writeFileSync } from "node:fs";

if (process.argv.includes("--version")) {
  process.stdout.write("fake-claude 0.0.1\n");
  process.exit(0);
}

const pidPath = process.env.FAKE_CLAUDE_PID_FILE?.trim();
if (pidPath) {
  writeFileSync(pidPath, `${process.pid}\n`, "utf-8");
}

const text = process.argv.at(-1) ?? "";
if (text.includes("hang")) {
  process.on("SIGTERM", () => undefined);
  setInterval(() => undefined, 1000);
} else {
  process.stdout.write(`echo:${text}\n`);
  process.exit(0);
}
