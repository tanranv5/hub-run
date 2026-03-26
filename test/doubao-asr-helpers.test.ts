import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_AUDIO_CONFIG,
  splitPcmFrames,
} from "../api/asr/providers/doubao/audio";
import { classifyDoubaoResponse } from "../api/asr/providers/doubao/response";

test("splitPcmFrames pads a short tail to a full 20ms frame", () => {
  const halfFrame = Buffer.alloc(DEFAULT_AUDIO_CONFIG.bytesPerFrame / 2, 1);
  const frames = splitPcmFrames(halfFrame, DEFAULT_AUDIO_CONFIG);

  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.byteLength, DEFAULT_AUDIO_CONFIG.bytesPerFrame);
  assert.deepEqual(
    frames[0]?.subarray(0, halfFrame.byteLength),
    halfFrame,
  );
  assert.deepEqual(
    frames[0]?.subarray(halfFrame.byteLength),
    Buffer.alloc(DEFAULT_AUDIO_CONFIG.bytesPerFrame - halfFrame.byteLength),
  );
});

test("classifyDoubaoResponse distinguishes heartbeat interim final and vad start", () => {
  assert.deepEqual(
    classifyDoubaoResponse({
      message_type: "ResultChanged",
      result_json: "",
    }),
    { type: "heartbeat" },
  );

  assert.deepEqual(
    classifyDoubaoResponse({
      message_type: "ResultChanged",
      result_json: JSON.stringify({
        extra: { vad_start: true },
      }),
    }),
    { type: "vad_start" },
  );

  assert.deepEqual(
    classifyDoubaoResponse({
      message_type: "ResultChanged",
      result_json: JSON.stringify({
        results: [
          {
            text: "中间态",
            is_interim: true,
            is_vad_finished: false,
          },
        ],
        extra: {},
      }),
    }),
    {
      type: "interim_result",
      text: "中间态",
      raw: {
        extra: {},
        results: [
          {
            is_interim: true,
            is_vad_finished: false,
            text: "中间态",
          },
        ],
      },
    },
  );

  assert.deepEqual(
    classifyDoubaoResponse({
      message_type: "ResultChanged",
      result_json: JSON.stringify({
        results: [
          {
            text: "最终态",
            is_interim: false,
            is_vad_finished: true,
            extra: { nonstream_result: true },
          },
        ],
        extra: {},
      }),
    }),
    {
      type: "final_result",
      text: "最终态",
      raw: {
        extra: {},
        results: [
          {
            extra: { nonstream_result: true },
            is_interim: false,
            is_vad_finished: true,
            text: "最终态",
          },
        ],
      },
    },
  );
});

test("classifyDoubaoResponse surfaces invalid result_json instead of swallowing it", () => {
  assert.deepEqual(
    classifyDoubaoResponse({
      message_type: "ResultChanged",
      result_json: "{not-json",
    }),
    {
      type: "error",
      error: "Invalid Doubao result_json payload",
    },
  );
});
