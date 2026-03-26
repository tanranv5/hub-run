import type { AsrProviderEvent } from "../../types";

interface DoubaoResultItem {
  readonly text?: string;
  readonly is_interim?: boolean;
  readonly is_vad_finished?: boolean;
  readonly extra?: {
    readonly nonstream_result?: boolean;
  };
}

interface DoubaoResultPayload {
  readonly results?: readonly DoubaoResultItem[];
  readonly extra?: {
    readonly vad_start?: boolean;
  };
}

interface ParsedPayload {
  readonly payload: DoubaoResultPayload | null;
  readonly invalid: boolean;
}

export interface DoubaoWireResponse {
  readonly message_type?: string;
  readonly status_message?: string;
  readonly result_json?: string;
}

function parsePayload(resultJson: string | undefined): ParsedPayload {
  if (!resultJson) {
    return { payload: null, invalid: false };
  }
  try {
    return {
      payload: JSON.parse(resultJson) as DoubaoResultPayload,
      invalid: false,
    };
  } catch {
    return { payload: null, invalid: true };
  }
}

function joinResultText(results: readonly DoubaoResultItem[]): string {
  return results
    .map((item) => item.text?.trim() ?? "")
    .filter((item) => item.length > 0)
    .join("")
    .trim();
}

function isFinalResult(results: readonly DoubaoResultItem[]): boolean {
  return results.some((item) => {
    if (item.extra?.nonstream_result) {
      return true;
    }
    return item.is_interim === false && item.is_vad_finished === true;
  });
}

export function classifyDoubaoResponse(
  response: DoubaoWireResponse,
): AsrProviderEvent {
  if (response.message_type === "TaskFailed" || response.message_type === "SessionFailed") {
    return {
      type: "error",
      error: response.status_message ?? "Doubao ASR failed",
    };
  }

  if (response.message_type === "SessionFinished") {
    return { type: "session_finished" };
  }

  const parsed = parsePayload(response.result_json);
  if (parsed.invalid) {
    return {
      type: "error",
      error: "Invalid Doubao result_json payload",
    };
  }

  if (!parsed.payload) {
    return { type: "heartbeat" };
  }

  const payload = parsed.payload;
  if (payload.extra?.vad_start) {
    return { type: "vad_start" };
  }

  if (!payload.results || payload.results.length === 0) {
    return { type: "heartbeat" };
  }

  const text = joinResultText(payload.results);
  return {
    type: isFinalResult(payload.results) ? "final_result" : "interim_result",
    ...(text ? { text } : {}),
    raw: payload,
  };
}
