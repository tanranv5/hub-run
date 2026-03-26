import type {
  AsrAudioEncoding,
  AsrSessionEvent,
} from "../api/asr/types";
import { readJson } from "./api";

interface AsrSessionCreatePayload {
  ok: boolean;
  sessionId: string;
  providerId: string;
  status: string;
}

interface AsrSessionMutationPayload {
  ok: boolean;
  status: string;
}

export async function createAsrSession(input: {
  providerId: string;
  sampleRate: number;
  channels: number;
  encoding: AsrAudioEncoding;
}): Promise<string> {
  const response = await fetch("/api/asr/sessions", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson<AsrSessionCreatePayload>(response);
  return payload.sessionId;
}

export async function appendAsrAudioChunk(
  sessionId: string,
  chunk: Uint8Array,
): Promise<void> {
  const response = await fetch(`/api/asr/sessions/${sessionId}/audio`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/octet-stream",
    },
    body: chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength,
    ),
  });
  await readJson<AsrSessionMutationPayload>(response);
}

export async function finishAsrSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/asr/sessions/${sessionId}/finish`, {
    method: "POST",
    credentials: "include",
  });
  await readJson<AsrSessionMutationPayload>(response);
}

export async function cancelAsrSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/asr/sessions/${sessionId}/cancel`, {
    method: "POST",
    credentials: "include",
  });
  await readJson<AsrSessionMutationPayload>(response);
}

export function openAsrEventStream(
  sessionId: string,
  onEvent: (event: AsrSessionEvent) => void,
  onError: (message: string) => void,
): EventSource {
  const source = new EventSource(
    `/api/asr/sessions/${sessionId}/events?afterEventId=0`,
    { withCredentials: true },
  );
  source.addEventListener("asr", (event) => {
    onEvent(JSON.parse(event.data) as AsrSessionEvent);
  });
  source.onerror = () => {
    onError("语音识别连接中断");
  };
  return source;
}
