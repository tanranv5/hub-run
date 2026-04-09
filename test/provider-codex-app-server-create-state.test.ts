import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { closeCodexAppServerClient } from "../api/providers/transports/codex-app-server";
import { getCodexUserInputStorePath } from "../api/providers/transports/codex-app-server-user-input-store";
import {
  login,
  setupCodexAppServerTest,
} from "./provider-codex-app-server-test-helpers";

function requireEnvText(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function readJsonFile(path: string) {
  return JSON.parse(await readFile(path, "utf-8")) as Record<string, unknown>;
}

async function readStoredUserInputs() {
  try {
    return JSON.parse(
      await readFile(getCodexUserInputStorePath(process.env), "utf-8"),
    ) as unknown[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function completePendingTurnInFakeAppServer(
  threadId: string,
  turnId: string,
) {
  const statePath = requireEnvText("FAKE_CODEX_APP_SERVER_STATE_PATH");
  const state = await readJsonFile(statePath);
  const threads = Array.isArray(state.threads) ? state.threads : [];
  const pendingRequests = Array.isArray(state.pendingRequests)
    ? state.pendingRequests
    : [];
  const nextThreads = threads.map((thread) => {
    if (!thread || typeof thread !== "object") {
      return thread;
    }
    const record = thread as Record<string, unknown>;
    if (record.threadId !== threadId || !Array.isArray(record.turns)) {
      return thread;
    }
    return {
      ...record,
      turns: record.turns.map((turn) => {
        if (!turn || typeof turn !== "object") {
          return turn;
        }
        return (turn as Record<string, unknown>).id === turnId
          ? { ...(turn as Record<string, unknown>), status: "completed" }
          : turn;
      }),
    };
  });
  const nextPendingRequests = pendingRequests.filter((request) => {
    if (!request || typeof request !== "object") {
      return false;
    }
    const record = request as Record<string, unknown>;
    return record.threadId !== threadId || record.turnId !== turnId;
  });
  await writeFile(
    statePath,
    `${JSON.stringify({
      ...state,
      threads: nextThreads,
      pendingRequests: nextPendingRequests,
    })}\n`,
    "utf-8",
  );
}

test("codex create rejects missing first message without creating an orphan thread", async (t) => {
  const setup = await setupCodexAppServerTest();
  t.after(async () => {
    await setup.cleanup();
  });

  const cookie = await login(setup.app);
  const emptyCreateResponse = await setup.app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/tmp/project",
    }),
  });

  assert.equal(emptyCreateResponse.status, 400);
  assert.match(await emptyCreateResponse.text(), /text or images is required/i);

  const createResponse = await setup.app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/tmp/project",
      text: "need-input",
    }),
  });

  assert.equal(createResponse.status, 200);
  assert.deepEqual(await createResponse.json(), {
    ok: true,
    sessionId: "thread-1",
    turnId: "turn-1",
  });
});

test("codex create route uses app-server mainline and exposes state and user input", async (t) => {
  const setup = await setupCodexAppServerTest();
  t.after(async () => {
    await setup.cleanup();
  });

  const cookie = await login(setup.app);
  const createResponse = await setup.app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/tmp/project",
      text: "need-input",
      model: "gpt-5.3-codex",
      effort: "high",
    }),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();
  assert.deepEqual(created, {
    ok: true,
    sessionId: "thread-1",
    turnId: "turn-1",
  });

  const stateResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/state?turnId=${created.turnId}`,
    {
      headers: { cookie },
    },
  );

  assert.equal(stateResponse.status, 200);
  assert.deepEqual(await stateResponse.json(), {
    threadId: created.sessionId,
    activeTurnId: created.turnId,
    isGenerating: true,
    requestedTurnId: created.turnId,
    requestedTurnStatus: "inProgress",
  });

  const requestsResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input`,
    {
      headers: { cookie },
    },
  );

  assert.equal(requestsResponse.status, 200);
  assert.deepEqual(await requestsResponse.json(), {
    requests: [
      {
        requestId: "req-1",
        threadId: created.sessionId,
        turnId: created.turnId,
        itemId: "item-req-1",
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
    ],
  });

  const respondResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input/req-1/respond`,
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: {
          confirm: {
            answers: ["继续"],
          },
        },
      }),
    },
  );

  assert.equal(respondResponse.status, 200);
  assert.deepEqual(await respondResponse.json(), { ok: true });

  const stateAfterResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/state?turnId=${created.turnId}`,
    {
      headers: { cookie },
    },
  );

  assert.equal(stateAfterResponse.status, 200);
  assert.deepEqual(await stateAfterResponse.json(), {
    threadId: created.sessionId,
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: created.turnId,
    requestedTurnStatus: "completed",
  });
});

test("codex pending user input survives app-server client restart and can still be answered", async (t) => {
  const setup = await setupCodexAppServerTest();
  t.after(async () => {
    await setup.cleanup();
  });

  const cookie = await login(setup.app);
  const createResponse = await setup.app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/tmp/project",
      text: "need-input",
    }),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();

  const initialRequestsResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input`,
    {
      headers: { cookie },
    },
  );

  assert.equal(initialRequestsResponse.status, 200);
  assert.deepEqual(await initialRequestsResponse.json(), {
    requests: [
      {
        requestId: "req-1",
        threadId: created.sessionId,
        turnId: created.turnId,
        itemId: "item-req-1",
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
    ],
  });

  await closeCodexAppServerClient();

  const requestsResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input`,
    {
      headers: { cookie },
    },
  );

  assert.equal(requestsResponse.status, 200);
  assert.deepEqual(await requestsResponse.json(), {
    requests: [
      {
        requestId: "req-1",
        threadId: created.sessionId,
        turnId: created.turnId,
        itemId: "item-req-1",
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
    ],
  });

  const respondResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input/req-1/respond`,
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: {
          confirm: {
            answers: ["继续"],
          },
        },
      }),
    },
  );

  assert.equal(respondResponse.status, 200);
  assert.deepEqual(await respondResponse.json(), { ok: true });

  const stateResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/state?turnId=${created.turnId}`,
    {
      headers: { cookie },
    },
  );

  assert.equal(stateResponse.status, 200);
  assert.deepEqual(await stateResponse.json(), {
    threadId: created.sessionId,
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: created.turnId,
    requestedTurnStatus: "completed",
  });
});

test("codex request listing clears stale persisted user input after the turn already completed", async (t) => {
  const setup = await setupCodexAppServerTest();
  t.after(async () => {
    await setup.cleanup();
  });

  const cookie = await login(setup.app);
  const createResponse = await setup.app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/tmp/project",
      text: "need-input",
    }),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();

  const initialRequestsResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input`,
    {
      headers: { cookie },
    },
  );

  assert.equal(initialRequestsResponse.status, 200);
  assert.equal((await initialRequestsResponse.json()).requests.length, 1);

  await closeCodexAppServerClient();
  await completePendingTurnInFakeAppServer(created.sessionId, created.turnId);

  const requestsResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input`,
    {
      headers: { cookie },
    },
  );

  assert.equal(requestsResponse.status, 200);
  assert.deepEqual(await requestsResponse.json(), { requests: [] });
  assert.deepEqual(await readStoredUserInputs(), []);
});

test("codex stale user input submission fails fast and clears persisted request", async (t) => {
  const setup = await setupCodexAppServerTest();
  t.after(async () => {
    await setup.cleanup();
  });

  const cookie = await login(setup.app);
  const createResponse = await setup.app.request("/api/providers/codex/sessions", {
    method: "POST",
    headers: {
      cookie,
      origin: "http://127.0.0.1:12001",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      cwd: "/tmp/project",
      text: "need-input",
    }),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();

  const initialRequestsResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input`,
    {
      headers: { cookie },
    },
  );

  assert.equal(initialRequestsResponse.status, 200);
  assert.equal((await initialRequestsResponse.json()).requests.length, 1);

  await closeCodexAppServerClient();
  await completePendingTurnInFakeAppServer(created.sessionId, created.turnId);

  const respondResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/requests/user-input/req-1/respond`,
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: {
          confirm: {
            answers: ["继续"],
          },
        },
      }),
    },
  );

  assert.equal(respondResponse.status, 400);
  assert.match(await respondResponse.text(), /stale user input request/i);
  assert.deepEqual(await readStoredUserInputs(), []);
});
