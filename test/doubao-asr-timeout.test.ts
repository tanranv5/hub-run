import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchWithTimeout,
  withTimeout,
} from "../api/asr/providers/doubao/timeout";

test("withTimeout rejects a hanging operation with a diagnostic label", async () => {
  await assert.rejects(
    withTimeout(
      new Promise<string>(() => undefined),
      20,
      "doubao test operation",
    ),
    /doubao test operation timed out/i,
  );
});

test("fetchWithTimeout preserves upstream abort signals", async () => {
  const upstream = new AbortController();
  setTimeout(() => {
    upstream.abort(new Error("upstream aborted"));
  }, 10);
  const result = await Promise.race([
    fetchWithTimeout(
      "https://example.com/asr",
      { signal: upstream.signal },
      200,
      async (_input, init) =>
        await new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal.reason ?? new Error("upstream aborted"));
          });
        }),
      "doubao fetch abort",
    )
      .then(() => "resolved")
      .catch((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      ),
    new Promise<string>((resolve) => {
        setTimeout(() => resolve("hung"), 80);
      }),
  ]);

  assert.notEqual(result, "hung");
  assert.match(String(result), /upstream aborted/i);
});
