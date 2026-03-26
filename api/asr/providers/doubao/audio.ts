import OpusScript from "opusscript";

const DEFAULT_FRAME_DURATION_MS = 20;
const BYTES_PER_SAMPLE = 2;
type SupportedSampleRate = 8_000 | 12_000 | 16_000 | 24_000 | 48_000;

export interface DoubaoAudioConfig {
  readonly sampleRate: number;
  readonly channels: number;
  readonly frameDurationMs: number;
  readonly samplesPerFrame: number;
  readonly bytesPerFrame: number;
}

export const DEFAULT_AUDIO_CONFIG: DoubaoAudioConfig = resolveAudioConfig(
  16_000,
  1,
);

export function resolveAudioConfig(
  sampleRate: number,
  channels: number,
  frameDurationMs = DEFAULT_FRAME_DURATION_MS,
): DoubaoAudioConfig {
  const samplesPerFrame = (sampleRate * frameDurationMs) / 1000;
  const bytesPerFrame = samplesPerFrame * channels * BYTES_PER_SAMPLE;
  return {
    sampleRate,
    channels,
    frameDurationMs,
    samplesPerFrame,
    bytesPerFrame,
  };
}

export function splitPcmFrames(
  pcmData: Uint8Array,
  config: DoubaoAudioConfig,
): Buffer[] {
  if (pcmData.byteLength === 0) {
    return [];
  }

  const frames: Buffer[] = [];
  for (let offset = 0; offset < pcmData.byteLength; offset += config.bytesPerFrame) {
    const slice = pcmData.subarray(offset, offset + config.bytesPerFrame);
    frames.push(padFrame(slice, config));
  }
  return frames;
}

export function padFrame(
  frame: Uint8Array,
  config: DoubaoAudioConfig,
): Buffer {
  if (frame.byteLength === config.bytesPerFrame) {
    return Buffer.from(frame);
  }

  const padded = Buffer.alloc(config.bytesPerFrame);
  padded.set(frame);
  return padded;
}

export function createSilenceFrame(config: DoubaoAudioConfig): Buffer {
  return Buffer.alloc(config.bytesPerFrame);
}

export function createOpusEncoder(config: DoubaoAudioConfig) {
  return new OpusScript(
    config.sampleRate as SupportedSampleRate,
    config.channels,
    OpusScript.Application.AUDIO,
  );
}

export function encodeOpusFrame(
  encoder: OpusScript,
  frame: Uint8Array,
  config: DoubaoAudioConfig,
): Uint8Array {
  const encoded = encoder.encode(Buffer.from(frame), config.samplesPerFrame);
  return new Uint8Array(encoded);
}
