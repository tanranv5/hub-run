import assert from "node:assert/strict";
import test from "node:test";
import { createAsrRegistry } from "../api/asr/registry";

test("default asr registry exposes the built-in doubao provider", () => {
  const registry = createAsrRegistry();

  assert.ok(registry.doubao);
  assert.equal(registry.doubao.summary.id, "doubao");
  assert.equal(registry.doubao.summary.label, "Doubao ASR");
});

test("asr registry can explicitly disable the doubao provider", () => {
  const previous = process.env.HUB_RUN_ENABLE_DOUBAO_ASR;
  process.env.HUB_RUN_ENABLE_DOUBAO_ASR = "false";

  try {
    const registry = createAsrRegistry();
    assert.equal("doubao" in registry, false);
  } finally {
    if (previous === undefined) {
      delete process.env.HUB_RUN_ENABLE_DOUBAO_ASR;
    } else {
      process.env.HUB_RUN_ENABLE_DOUBAO_ASR = previous;
    }
  }
});
