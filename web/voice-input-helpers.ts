const MIN_PCM16_VALUE = -32767;
const MAX_PCM16_VALUE = 32767;

export interface VoiceTranscriptBuffer {
  committedText: string;
  liveText: string;
}

export function downsampleFloat32ToInt16(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
): Int16Array {
  if (input.length === 0) {
    return new Int16Array();
  }
  if (inputSampleRate <= outputSampleRate) {
    return float32ToInt16(input);
  }

  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    output[index] = toPcm16(averageRange(input, start, end));
  }
  return output;
}

export function encodePcm16Chunk(samples: Int16Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    bytes[index * 2] = sample & 0xff;
    bytes[index * 2 + 1] = (sample >> 8) & 0xff;
  }
  return bytes;
}

export function mergeDraftWithTranscript(
  draft: string,
  transcript: string,
): string {
  const left = draft.trim();
  const right = transcript.trim();
  if (!right) {
    return draft;
  }
  if (!left) {
    return right;
  }
  return `${left}\n${right}`;
}

export function createVoiceTranscriptBuffer(): VoiceTranscriptBuffer {
  return {
    committedText: "",
    liveText: "",
  };
}

export function applyVoiceTranscriptDelta(
  current: VoiceTranscriptBuffer,
  eventType: "interim_result" | "final_result",
  text: string,
): VoiceTranscriptBuffer {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return current;
  }
  if (eventType === "interim_result") {
    return {
      ...current,
      liveText: normalizedText,
    };
  }
  return {
    committedText: mergeTranscriptSegments(current.committedText, normalizedText),
    liveText: "",
  };
}

export function readVoiceTranscript(
  current: VoiceTranscriptBuffer,
): string {
  return mergeTranscriptSegments(current.committedText, current.liveText);
}

export function mergeTranscriptSegments(base: string, addition: string): string {
  const left = base.trim();
  const right = addition.trim();
  if (!right) {
    return left;
  }
  if (!left || left === right || left.endsWith(right)) {
    return left || right;
  }
  const overlap = findSuffixPrefixOverlap(left, right);
  return `${left}${right.slice(overlap)}`;
}

function float32ToInt16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    output[index] = toPcm16(input[index]);
  }
  return output;
}

function averageRange(
  input: Float32Array,
  start: number,
  end: number,
): number {
  let sum = 0;
  let count = 0;
  for (let index = start; index < end; index += 1) {
    sum += input[index];
    count += 1;
  }
  if (count === 0) {
    return input[Math.min(start, input.length - 1)] ?? 0;
  }
  return sum / count;
}

function toPcm16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.trunc(
    clamped * (clamped < 0 ? -MIN_PCM16_VALUE : MAX_PCM16_VALUE),
  );
}

function findSuffixPrefixOverlap(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  for (let length = maxLength; length > 0; length -= 1) {
    if (left.endsWith(right.slice(0, length))) {
      return length;
    }
  }
  return 0;
}
