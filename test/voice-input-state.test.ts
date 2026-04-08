import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceTranscriptBuffer, readVoiceTranscript } from "../web/voice-input-helpers";
import {
  applyAsrStreamError,
  consumeAsrEvent,
  resetVoiceInputSessionState,
} from "../web/use-voice-input";

test("voice input ignores EventSource disconnect after a terminal ASR event", () => {
  let errorMessage: string | null = null;
  let terminal = true;

  applyAsrStreamError(
    "语音识别连接中断",
    () => terminal,
    (nextError) => {
      errorMessage = nextError;
    },
    () => {
      terminal = true;
    },
  );

  assert.equal(errorMessage, null);
  assert.equal(terminal, true);
});

test("voice input keeps latest transcript when final result arrives", () => {
  let transcriptBuffer = createVoiceTranscriptBuffer();
  let errorMessage: string | null = null;
  let terminal = false;
  let stopReady = false;

  consumeAsrEvent(
    { type: "final_result", text: "识别完成" } as never,
    () => transcriptBuffer,
    (nextBuffer) => {
      transcriptBuffer = nextBuffer;
    },
    (nextError) => {
      errorMessage = nextError;
    },
    () => terminal,
    () => {
      terminal = true;
    },
    () => {
      stopReady = true;
    },
  );

  assert.equal(readVoiceTranscript(transcriptBuffer), "识别完成");
  assert.equal(errorMessage, null);
  assert.equal(terminal, false);
  assert.equal(stopReady, true);
});

test("voice input accumulates multiple finalized chunks instead of overwriting older text", () => {
  let transcriptBuffer = createVoiceTranscriptBuffer();
  let errorMessage: string | null = null;
  let terminal = false;

  consumeAsrEvent(
    { type: "final_result", text: "第一句" } as never,
    () => transcriptBuffer,
    (nextBuffer) => {
      transcriptBuffer = nextBuffer;
    },
    (nextError) => {
      errorMessage = nextError;
    },
    () => terminal,
    () => {
      terminal = true;
    },
  );

  consumeAsrEvent(
    { type: "interim_result", text: "第二" } as never,
    () => transcriptBuffer,
    (nextBuffer) => {
      transcriptBuffer = nextBuffer;
    },
    (nextError) => {
      errorMessage = nextError;
    },
    () => terminal,
    () => {
      terminal = true;
    },
  );

  assert.equal(readVoiceTranscript(transcriptBuffer), "第一句第二");

  consumeAsrEvent(
    { type: "final_result", text: "第二句" } as never,
    () => transcriptBuffer,
    (nextBuffer) => {
      transcriptBuffer = nextBuffer;
    },
    (nextError) => {
      errorMessage = nextError;
    },
    () => terminal,
    () => {
      terminal = true;
    },
  );

  assert.equal(readVoiceTranscript(transcriptBuffer), "第一句第二句");
  assert.equal(errorMessage, null);
  assert.equal(terminal, false);
});

test("voice input session reset cancels active controller and clears local state", async () => {
  let cancelled = 0;
  let phase = "recording";
  let errorMessage = "旧错误";
  const controllerRef = {
    current: {
      cancel: async () => {
        cancelled += 1;
      },
      stop: async () => "",
    },
  };
  const originalDraftRef = { current: "旧草稿" };
  const stoppedRef = { current: false };

  await resetVoiceInputSessionState({
    controllerRef,
    onError: (nextError) => {
      errorMessage = nextError;
    },
    originalDraftRef,
    setPhase: (nextPhase) => {
      phase = nextPhase;
    },
    stoppedRef,
  });

  assert.equal(cancelled, 1);
  assert.equal(controllerRef.current, null);
  assert.equal(originalDraftRef.current, "");
  assert.equal(stoppedRef.current, true);
  assert.equal(errorMessage, null);
  assert.equal(phase, "idle");
});
