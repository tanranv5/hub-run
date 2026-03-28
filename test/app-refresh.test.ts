import assert from "node:assert/strict";
import test from "node:test";
import { refreshAppData } from "../web/app-refresh";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("refreshAppData waits for provider reload to settle before bumping refresh version", async () => {
  const deferred = createDeferred<void>();
  const steps: string[] = [];

  const pending = refreshAppData({
    bumpRefreshVersion: () => {
      steps.push("bump");
    },
    reloadProviders: async () => {
      steps.push("reload:start");
      await deferred.promise;
      steps.push("reload:end");
    },
  });

  await Promise.resolve();
  assert.deepEqual(steps, ["reload:start"]);

  deferred.resolve();
  await pending;

  assert.deepEqual(steps, ["reload:start", "reload:end", "bump"]);
});

test("refreshAppData waits for conversation reload before bumping refresh version", async () => {
  const deferred = createDeferred<void>();
  const steps: string[] = [];

  const pending = refreshAppData({
    bumpRefreshVersion: () => {
      steps.push("bump");
    },
    reloadConversation: async () => {
      steps.push("conversation:start");
      await deferred.promise;
      steps.push("conversation:end");
    },
  });

  await Promise.resolve();
  assert.deepEqual(steps, ["conversation:start"]);

  deferred.resolve();
  await pending;

  assert.deepEqual(steps, ["conversation:start", "conversation:end", "bump"]);
});

test("refreshAppData still bumps refresh version when provider reload fails", async () => {
  const steps: string[] = [];

  await assert.rejects(
    refreshAppData({
      bumpRefreshVersion: () => {
        steps.push("bump");
      },
      reloadProviders: async () => {
        steps.push("reload");
        throw new Error("refresh exploded");
      },
    }),
    /refresh exploded/,
  );

  assert.deepEqual(steps, ["reload", "bump"]);
});

test("refreshAppData bumps refresh version when only message refresh is requested", async () => {
  const steps: string[] = [];

  await refreshAppData({
    bumpRefreshVersion: () => {
      steps.push("bump");
    },
  });

  assert.deepEqual(steps, ["bump"]);
});
