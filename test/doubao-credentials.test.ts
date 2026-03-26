import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { ensureDoubaoCredentials } from "../api/asr/providers/doubao/credentials";

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("ensureDoubaoCredentials refreshes token when deviceId override differs from cached file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hub-run-asr-creds-"));
  const credentialPath = join(directory, "credentials.json");
  await writeFile(
    credentialPath,
    JSON.stringify({
      deviceId: "cached-device",
      token: "cached-token",
      cdid: "cached-cdid",
      openudid: "cached-openudid",
      clientudid: "cached-clientudid",
    }),
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.includes("/service/settings/v3/")) {
      throw new Error(`unexpected fetch url: ${url}`);
    }
    return jsonResponse({
      data: {
        settings: {
          asr_config: {
            app_key: "fresh-token",
          },
        },
      },
    });
  };

  try {
    const credentials = await ensureDoubaoCredentials({
      credentialPath,
      deviceId: "override-device",
    });
    assert.equal(credentials.deviceId, "override-device");
    assert.equal(credentials.token, "fresh-token");
    assert.deepEqual(JSON.parse(await readFile(credentialPath, "utf-8")), {
      deviceId: "cached-device",
      token: "cached-token",
      cdid: "cached-cdid",
      openudid: "cached-openudid",
      clientudid: "cached-clientudid",
    });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test("ensureDoubaoCredentials fails fast when token fetch hangs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    await new Promise<Response>(() => undefined);

  try {
    const result = await Promise.race([
      ensureDoubaoCredentials({
        deviceId: "override-device",
        credentialPath: join(tmpdir(), "hub-run-never-used.json"),
        requestTimeoutMs: 20,
      } as never)
        .then(() => "resolved")
        .catch((error: unknown) =>
          error instanceof Error ? error.message : String(error),
        ),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("hung"), 80);
      }),
    ]);
    assert.notEqual(result, "hung");
    assert.match(String(result), /timed out/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
