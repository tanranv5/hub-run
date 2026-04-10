import assert from "node:assert/strict";
import test from "node:test";
import type { Dispatch, SetStateAction } from "react";
import type { ProviderSummary } from "../api/types";
import {
  bootstrapApp,
  INITIAL_BOOTSTRAP,
  type BootstrapState,
} from "../web/bootstrap-state";

function createBootstrapStore(initial: BootstrapState = INITIAL_BOOTSTRAP) {
  let value = initial;
  const setValue: Dispatch<SetStateAction<BootstrapState>> = (next) => {
    value = typeof next === "function" ? next(value) : next;
  };
  return {
    read: () => value,
    setValue,
  };
}

test("bootstrapApp does not request providers before login succeeds", async () => {
  const store = createBootstrapStore();
  let readProvidersCalls = 0;

  await bootstrapApp(store.setValue, {
    readAuthStatus: async () => ({
      authEnabled: true,
      authenticated: false,
    }),
    readProviders: async () => {
      readProvidersCalls += 1;
      return [];
    },
  });

  assert.equal(readProvidersCalls, 0);
  assert.deepEqual(store.read(), {
    ...INITIAL_BOOTSTRAP,
    auth: {
      authEnabled: true,
      authenticated: false,
    },
    loading: false,
  });
});

test("bootstrapApp loads providers after authentication and picks the default provider", async () => {
  const store = createBootstrapStore();
  const providers: ProviderSummary[] = [
    {
      id: "codex",
      label: "Codex",
      description: "OpenAI Codex",
      rootPath: "/tmp/.codex",
      capabilities: {
        history: true,
        send: true,
        stream: true,
        attach: true,
        createSession: true,
        emptyCreateSession: false,
        modelSelection: true,
        threadState: true,
        interrupt: true,
        userInput: true,
        deleteSession: true,
      },
      status: {
        historyReadable: true,
        sendAvailable: true,
        configResolved: true,
        lastError: null,
      },
    },
  ];

  await bootstrapApp(store.setValue, {
    readAuthStatus: async () => ({
      authEnabled: true,
      authenticated: true,
    }),
    readProviders: async () => providers,
  });

  assert.equal(store.read().selectedProviderId, "codex");
  assert.deepEqual(store.read().providers, providers);
  assert.equal(store.read().loading, false);
});
