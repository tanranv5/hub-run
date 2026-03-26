import assert from "node:assert/strict";
import test from "node:test";
import {
  applyVoiceTranscriptDelta,
  createVoiceTranscriptBuffer,
  downsampleFloat32ToInt16,
  encodePcm16Chunk,
  mergeTranscriptSegments,
  mergeDraftWithTranscript,
  readVoiceTranscript,
} from "../web/voice-input-helpers";

test("downsampleFloat32ToInt16 converts browser float audio to 16k pcm16", () => {
  const input = new Float32Array([
    0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5,
    1, 1, 1,
    -1, -1, -1,
  ]);

  const output = downsampleFloat32ToInt16(input, 48_000, 16_000);

  assert.equal(output.length, 4);
  assert.deepEqual(Array.from(output), [16383, -16383, 32767, -32767]);
});

test("encodePcm16Chunk writes little-endian audio bytes", () => {
  const bytes = encodePcm16Chunk(new Int16Array([1, -2, 258]));
  assert.deepEqual(Array.from(bytes), [1, 0, 254, 255, 2, 1]);
});

test("mergeDraftWithTranscript appends transcript without losing existing draft", () => {
  assert.equal(
    mergeDraftWithTranscript("先保留这句", "补一段语音"),
    "先保留这句\n补一段语音",
  );
  assert.equal(mergeDraftWithTranscript("", "补一段语音"), "补一段语音");
  assert.equal(mergeDraftWithTranscript("先保留这句", ""), "先保留这句");
});

test("mergeTranscriptSegments deduplicates overlap between finalized chunks", () => {
  assert.equal(mergeTranscriptSegments("你好", "你好世界"), "你好世界");
  assert.equal(mergeTranscriptSegments("hello wor", "world"), "hello world");
  assert.equal(mergeTranscriptSegments("旧内容", "新内容"), "旧内容新内容");
});

test("voice transcript buffer keeps committed chunks and overlays live interim text", () => {
  let buffer = createVoiceTranscriptBuffer();
  buffer = applyVoiceTranscriptDelta(buffer, "final_result", "第一句");
  assert.equal(readVoiceTranscript(buffer), "第一句");

  buffer = applyVoiceTranscriptDelta(buffer, "interim_result", "第二");
  assert.equal(readVoiceTranscript(buffer), "第一句第二");

  buffer = applyVoiceTranscriptDelta(buffer, "final_result", "第二句");
  assert.equal(readVoiceTranscript(buffer), "第一句第二句");
});
