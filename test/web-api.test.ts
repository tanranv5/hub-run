import assert from "node:assert/strict";
import test from "node:test";
import { AuthLostError, readJson } from "../web/api";

test("readJson throws AuthLostError on 401 responses", async () => {
  await assert.rejects(
    () =>
      readJson(
        new Response(JSON.stringify({ error: { message: "Login required" } }), {
          status: 401,
          headers: {
            "content-type": "application/json",
          },
        }),
      ),
    AuthLostError,
  );
});

test("readJson surfaces HTML fallback responses with a clear error", async () => {
  await assert.rejects(
    () =>
      readJson(
        new Response("<!doctype html><html><body>hub-run</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
          },
        }),
      ),
    /Expected JSON response but received text\/html/,
  );
});
