import assert from "node:assert/strict";
import test from "node:test";
import {
  login,
  setupCodexAppServerTest,
} from "./provider-codex-app-server-test-helpers";

test("codex send route uses app-server mainline and supports interrupt", async (t) => {
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
      text: "bootstrap",
    }),
  });

  assert.equal(createResponse.status, 200);
  const created = await createResponse.json();

  const sendResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/messages`,
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: "follow-up hold-open",
      }),
    },
  );

  assert.equal(sendResponse.status, 200);
  const sent = await sendResponse.json();
  assert.deepEqual(sent, {
    ok: true,
    turnId: sent.turnId,
    outputText: null,
  });
  assert.equal(typeof sent.turnId, "string");

  const interruptResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/interrupt`,
    {
      method: "POST",
      headers: {
        cookie,
        origin: "http://127.0.0.1:12001",
      },
    },
  );

  assert.equal(interruptResponse.status, 200);
  assert.deepEqual(await interruptResponse.json(), { ok: true });

  const stateResponse = await setup.app.request(
    `/api/providers/codex/sessions/${created.sessionId}/state?turnId=${sent.turnId}`,
    {
      headers: { cookie },
    },
  );

  assert.equal(stateResponse.status, 200);
  assert.deepEqual(await stateResponse.json(), {
    threadId: created.sessionId,
    activeTurnId: null,
    isGenerating: false,
    requestedTurnId: sent.turnId,
    requestedTurnStatus: "interrupted",
  });
});
