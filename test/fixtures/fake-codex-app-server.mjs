#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

if (process.argv[2] === "--version") {
  process.stdout.write("fake-codex 0.0.1\n");
  process.exit(0);
}

if (process.argv[2] !== "app-server") {
  process.stderr.write(`unsupported args: ${process.argv.slice(2).join(" ")}\n`);
  process.exit(64);
}

const statePath = process.env.FAKE_CODEX_APP_SERVER_STATE_PATH?.trim() ?? "";
const persistedState = loadState();
const threads = new Map(
  persistedState.threads.map((thread) => [thread.threadId, thread]),
);
const pendingRequests = new Map(
  persistedState.pendingRequests.map((request) => [request.requestId, request]),
);
let nextThreadId = persistedState.nextThreadId;
let nextTurnId = persistedState.nextTurnId;
let nextRequestId = persistedState.nextRequestId;

function write(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function reply(id, result) {
  write({ jsonrpc: "2.0", id, result });
}

function replyError(id, message) {
  write({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32000,
      message,
    },
  });
}

function loadState() {
  if (!statePath || !existsSync(statePath)) {
    return {
      threads: [],
      pendingRequests: [],
      nextThreadId: 1,
      nextTurnId: 1,
      nextRequestId: 1,
    };
  }

  const parsed = JSON.parse(readFileSync(statePath, "utf-8"));
  return {
    threads: Array.isArray(parsed.threads) ? parsed.threads : [],
    pendingRequests: Array.isArray(parsed.pendingRequests)
      ? parsed.pendingRequests
      : [],
    nextThreadId: Number.isFinite(parsed.nextThreadId) ? parsed.nextThreadId : 1,
    nextTurnId: Number.isFinite(parsed.nextTurnId) ? parsed.nextTurnId : 1,
    nextRequestId: Number.isFinite(parsed.nextRequestId) ? parsed.nextRequestId : 1,
  };
}

function saveState() {
  if (!statePath) {
    return;
  }

  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(
    statePath,
    `${JSON.stringify({
      threads: [...threads.values()],
      pendingRequests: [...pendingRequests.entries()].map(([requestId, pending]) => ({
        requestId,
        ...pending,
      })),
      nextThreadId,
      nextTurnId,
      nextRequestId,
    })}\n`,
    "utf-8",
  );
}

function ensureThread(threadId) {
  const thread = threads.get(threadId);
  if (!thread) {
    throw new Error(`thread not found: ${threadId}`);
  }
  return thread;
}

function getFirstText(params) {
  const text = params?.input?.[0]?.text;
  return typeof text === "string" ? text : "";
}

function issueUserInputRequest(threadId, turnId) {
  const requestId = `req-${nextRequestId++}`;
  pendingRequests.set(requestId, { threadId, turnId });
  saveState();
  write({
    jsonrpc: "2.0",
    id: requestId,
    method: "item/tool/requestUserInput",
    params: {
      threadId,
      turnId,
      itemId: `item-${requestId}`,
      questions: [
        {
          id: "confirm",
          header: "继续执行",
          question: "请选择下一步",
          isOther: false,
          isSecret: false,
          options: [
            {
              label: "继续",
              description: "继续当前回合",
            },
          ],
        },
      ],
    },
  });
}

function handleMethod(message) {
  const { id, method, params } = message;
  try {
    if (method === "initialize") {
      reply(id, { ok: true });
      return;
    }

    if (method === "model/list") {
      reply(id, {
        data: [
          {
            id: "gpt-5.3-codex",
            displayName: "GPT-5.3 Codex",
            description: "fake model",
            isDefault: true,
            hidden: false,
            defaultReasoningEffort: "medium",
            supportedReasoningEfforts: ["low", "medium", "high"],
          },
        ],
      });
      return;
    }

    if (method === "thread/start") {
      const threadId = `thread-${nextThreadId++}`;
      threads.set(threadId, { threadId, turns: [] });
      saveState();
      reply(id, {
        thread: {
          id: threadId,
        },
      });
      return;
    }

    if (method === "turn/start") {
      const threadId = String(params?.threadId ?? "");
      const thread = ensureThread(threadId);
      const turnId = `turn-${nextTurnId++}`;
      const text = getFirstText(params);
      thread.turns.push({
        id: turnId,
        status: text.includes("need-input") || text.includes("hold-open")
          ? "in_progress"
          : "completed",
      });
      saveState();
      reply(id, {
        turn: {
          id: turnId,
        },
      });
      if (text.includes("need-input")) {
        issueUserInputRequest(threadId, turnId);
      }
      return;
    }

    if (method === "thread/read") {
      const threadId = String(params?.threadId ?? "");
      const thread = ensureThread(threadId);
      reply(id, {
        thread: {
          id: thread.threadId,
        },
        turns: thread.turns.map((turn) => ({
          id: turn.id,
          status: turn.status,
        })),
      });
      return;
    }

    if (method === "turn/interrupt") {
      const thread = ensureThread(String(params?.threadId ?? ""));
      const turnId = String(params?.turnId ?? "");
      const turn = thread.turns.find((entry) => entry.id === turnId);
      if (!turn) {
        throw new Error(`turn not found: ${turnId}`);
      }
      turn.status = "interrupted";
      saveState();
      reply(id, { ok: true });
      return;
    }

    if (method === "thread/resume") {
      reply(id, { ok: true });
      return;
    }

    replyError(id, `unsupported method: ${method}`);
  } catch (error) {
    replyError(id, error instanceof Error ? error.message : "unknown error");
  }
}

function handleClientResponse(message) {
  const requestId = String(message.id ?? "");
  const pending = pendingRequests.get(requestId);
  if (!pending) {
    return;
  }

  const thread = threads.get(pending.threadId);
  const turn = thread?.turns.find((entry) => entry.id === pending.turnId);
  if (turn) {
    turn.status = "completed";
  }

  pendingRequests.delete(requestId);
  saveState();
  write({
    jsonrpc: "2.0",
    method: "serverRequest/resolved",
    params: {
      requestId,
    },
  });
}

const reader = createInterface({
  input: process.stdin,
});

reader.on("line", (line) => {
  const text = line.trim();
  if (!text) {
    return;
  }

  const message = JSON.parse(text);
  if (typeof message?.method === "string") {
    handleMethod(message);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(message, "result")) {
    handleClientResponse(message);
  }
});
