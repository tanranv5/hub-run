import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { AsrSessionEvent } from "../api/asr/types";
import {
  appendAsrAudioChunk,
  cancelAsrSession,
  createAsrSession,
  finishAsrSession,
  openAsrEventStream,
} from "./asr-api";
import {
  applyVoiceTranscriptDelta,
  createVoiceTranscriptBuffer,
  downsampleFloat32ToInt16,
  encodePcm16Chunk,
  mergeDraftWithTranscript,
  readVoiceTranscript,
  type VoiceTranscriptBuffer,
} from "./voice-input-helpers";

const ASR_PROVIDER_ID = "doubao";
const TARGET_SAMPLE_RATE = 16_000;
const TARGET_CHANNELS = 1;
const TARGET_ENCODING = "pcm_s16le";
const UPLOAD_CHUNK_BYTES = 6_400;
const FINISH_TIMEOUT_MS = 10_000;

export type VoiceInputPhase = "idle" | "starting" | "recording" | "stopping";

interface VoiceInputController {
  cancel(): Promise<void>;
  stop(): Promise<string>;
}

interface EventStreamState {
  close(): void;
  getError(): string | null;
  getLatestText(): string;
  waitForTerminal(): Promise<void>;
}

interface MicrophoneCapture {
  stop(): Promise<void>;
}

export function useVoiceInput(props: {
  draft: string;
  onError: (message: string | null) => void;
  setDraft: (value: string) => void;
}) {
  const { draft, onError, setDraft } = props;
  const controllerRef = useRef<VoiceInputController | null>(null);
  const originalDraftRef = useRef("");
  const stoppedRef = useRef(false);
  const [phase, setPhase] = useState<VoiceInputPhase>("idle");

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      void controllerRef.current?.cancel();
      controllerRef.current = null;
    };
  }, []);

  async function handleVoiceClick() {
    if (phase === "starting" || phase === "stopping") {
      return;
    }
    if (phase === "recording") {
      await stopVoiceInput(
        controllerRef,
        originalDraftRef,
        stoppedRef,
        onError,
        setDraft,
        setPhase,
      );
      return;
    }
    await startVoiceInput(
      draft,
      controllerRef,
      originalDraftRef,
      stoppedRef,
      onError,
      setDraft,
      setPhase,
    );
  }

  return {
    handleVoiceClick,
    voicePhase: phase,
  };
}

async function startVoiceInput(
  draft: string,
  controllerRef: MutableRefObject<VoiceInputController | null>,
  originalDraftRef: MutableRefObject<string>,
  stoppedRef: MutableRefObject<boolean>,
  onError: (message: string | null) => void,
  setDraft: (value: string) => void,
  setPhase: (phase: VoiceInputPhase) => void,
) {
  onError(null);
  originalDraftRef.current = draft;
  stoppedRef.current = false;
  setPhase("starting");
  try {
    controllerRef.current = await createVoiceInputController((transcript) => {
      // Discard late ASR results after stop/cancel
      if (stoppedRef.current) {
        return;
      }
      setDraft(mergeDraftWithTranscript(originalDraftRef.current, transcript));
    });
    setPhase("recording");
  } catch (error) {
    controllerRef.current = null;
    setDraft(originalDraftRef.current);
    onError(getVoiceErrorMessage(error, "无法启动语音识别，请检查麦克风权限"));
    setPhase("idle");
  }
}

async function stopVoiceInput(
  controllerRef: MutableRefObject<VoiceInputController | null>,
  originalDraftRef: MutableRefObject<string>,
  stoppedRef: MutableRefObject<boolean>,
  onError: (message: string | null) => void,
  setDraft: (value: string) => void,
  setPhase: (phase: VoiceInputPhase) => void,
) {
  const controller = controllerRef.current;
  if (!controller) {
    setPhase("idle");
    return;
  }

  // Immediately prevent transcript callback from overwriting draft
  stoppedRef.current = true;
  setPhase("stopping");
  onError(null);
  try {
    const transcript = await controller.stop();
    if (!transcript.trim()) {
      setDraft(originalDraftRef.current);
      onError("未识别到语音内容");
    } else {
      setDraft(mergeDraftWithTranscript(originalDraftRef.current, transcript));
    }
  } catch (error) {
    setDraft(originalDraftRef.current);
    onError(getVoiceErrorMessage(error, "语音识别停止失败"));
  } finally {
    originalDraftRef.current = "";
    controllerRef.current = null;
    setPhase("idle");
  }
}

async function createVoiceInputController(
  onTranscript: (value: string) => void,
): Promise<VoiceInputController> {
  const sessionId = await createAsrSession({
    providerId: ASR_PROVIDER_ID,
    sampleRate: TARGET_SAMPLE_RATE,
    channels: TARGET_CHANNELS,
    encoding: TARGET_ENCODING,
  });

  const events = createEventStreamState(sessionId, onTranscript);
  let capture: MicrophoneCapture | null = null;
  let uploadQueue = Promise.resolve();

  const appendChunk = (chunk: Uint8Array) => {
    uploadQueue = uploadQueue.then(() => appendAsrAudioChunk(sessionId, chunk));
    return uploadQueue;
  };

  try {
    capture = await createMicrophoneCapture(appendChunk);
  } catch (error) {
    events.close();
    await cancelSilently(sessionId);
    throw error;
  }

  return {
    async stop() {
      await capture?.stop();
      await uploadQueue;
      await finishAsrSession(sessionId);
      await waitForTerminal(events);
      const error = events.getError();
      events.close();
      if (error) {
        throw new Error(error);
      }
      return events.getLatestText();
    },
    async cancel() {
      await capture?.stop().catch(() => undefined);
      await cancelSilently(sessionId);
      events.close();
    },
  };
}

function createEventStreamState(
  sessionId: string,
  onTranscript: (value: string) => void,
): EventStreamState {
  let transcriptBuffer = createVoiceTranscriptBuffer();
  let errorMessage: string | null = null;
  let terminal = false;
  let resolveTerminal: (() => void) | null = null;
  const terminalPromise = new Promise<void>((resolve) => {
    resolveTerminal = resolve;
  });

  const source = openAsrEventStream(
    sessionId,
    (event) => {
      consumeAsrEvent(
        event,
        () => transcriptBuffer,
        (nextBuffer) => {
          transcriptBuffer = nextBuffer;
          onTranscript(readVoiceTranscript(nextBuffer));
        },
        (nextError) => {
          errorMessage = nextError;
        },
        () => terminal,
        () => {
          terminal = true;
          resolveTerminal?.();
        },
      );
    },
    (message) => {
      applyAsrStreamError(
        message,
        () => terminal,
        (nextError) => {
          errorMessage = nextError;
        },
        () => {
          terminal = true;
          resolveTerminal?.();
        },
      );
    },
  );

  return {
    close() {
      source.close();
    },
    getError() {
      return errorMessage;
    },
    getLatestText() {
      return readVoiceTranscript(transcriptBuffer);
    },
    waitForTerminal() {
      return terminalPromise;
    },
  };
}

export function consumeAsrEvent(
  event: AsrSessionEvent,
  readTranscriptBuffer: () => VoiceTranscriptBuffer,
  setTranscriptBuffer: (value: VoiceTranscriptBuffer) => void,
  setError: (message: string | null) => void,
  isTerminal: () => boolean,
  markTerminal: () => void,
) {
  if (
    (event.type === "interim_result" || event.type === "final_result") &&
    event.text?.trim()
  ) {
    setTranscriptBuffer(
      applyVoiceTranscriptDelta(
        readTranscriptBuffer(),
        event.type,
        event.text,
      ),
    );
  }

  if (event.type === "error") {
    setError(event.error?.trim() || "语音识别失败");
  }

  if (
    event.type === "session_finished" ||
    event.type === "session_cancelled" ||
    event.type === "error"
  ) {
    if (!isTerminal()) {
      markTerminal();
    }
  }
}

export function applyAsrStreamError(
  message: string,
  isTerminal: () => boolean,
  setError: (value: string | null) => void,
  markTerminal: () => void,
) {
  if (isTerminal()) {
    return;
  }
  setError(message);
  markTerminal();
}

async function waitForTerminal(events: EventStreamState): Promise<void> {
  await Promise.race([
    events.waitForTerminal(),
    new Promise<void>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("语音识别完成超时"));
      }, FINISH_TIMEOUT_MS);
    }),
  ]);
}

async function createMicrophoneCapture(
  onChunk: (chunk: Uint8Array) => Promise<void>,
): Promise<MicrophoneCapture> {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持麦克风录音，请确保使用 HTTPS 访问并检查浏览器设置");
  }

  const stream = await mediaDevices.getUserMedia({
    audio: {
      channelCount: TARGET_CHANNELS,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  const AudioContextCtor = readAudioContextConstructor();
  const audioContext = new AudioContextCtor();
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;

  let bufferedBytes = new Uint8Array(0) as Uint8Array;
  let uploadQueue = Promise.resolve();
  processor.onaudioprocess = (event) => {
    const chunk = readAudioChunk(event.inputBuffer, audioContext.sampleRate);
    if (chunk.byteLength === 0) {
      return;
    }
    bufferedBytes = concatBytes(bufferedBytes, chunk);
    if (bufferedBytes.byteLength < UPLOAD_CHUNK_BYTES) {
      return;
    }
    const nextChunk = bufferedBytes;
    bufferedBytes = new Uint8Array(0) as Uint8Array;
    uploadQueue = uploadQueue.then(() => onChunk(nextChunk));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  return {
    async stop() {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      silentGain.disconnect();
      const finalChunk = bufferedBytes;
      bufferedBytes = new Uint8Array(0) as Uint8Array;
      if (finalChunk.byteLength > 0) {
        uploadQueue = uploadQueue.then(() => onChunk(finalChunk));
      }
      await uploadQueue;
      stream.getTracks().forEach((track) => track.stop());
      await audioContext.close();
    },
  };
}

function readAudioContextConstructor(): typeof AudioContext {
  const scopedWindow = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextCtor =
    globalThis.AudioContext ?? scopedWindow.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("当前浏览器不支持 AudioContext");
  }
  return AudioContextCtor;
}

function readAudioChunk(
  inputBuffer: AudioBuffer,
  inputSampleRate: number,
): Uint8Array {
  const channelData = inputBuffer.getChannelData(0);
  const pcm16 = downsampleFloat32ToInt16(
    channelData,
    inputSampleRate,
    TARGET_SAMPLE_RATE,
  );
  return encodePcm16Chunk(pcm16);
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  if (left.byteLength === 0) {
    return right;
  }
  if (right.byteLength === 0) {
    return left;
  }
  const merged = new Uint8Array(left.byteLength + right.byteLength);
  merged.set(left);
  merged.set(right, left.byteLength);
  return merged;
}

async function cancelSilently(sessionId: string): Promise<void> {
  await cancelAsrSession(sessionId).catch(() => undefined);
}

function getVoiceErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}
