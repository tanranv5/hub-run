import { randomUUID } from "node:crypto";
import { AsrServiceError } from "../../errors";
import type { AsrProvider } from "../../types";
import { DEFAULT_AUDIO_CONFIG, resolveAudioConfig } from "./audio";
import {
  DOUBAO_AID,
  DOUBAO_APP_NAME,
  DOUBAO_CREDENTIAL_PATH,
  DOUBAO_REQUEST_TIMEOUT_MS,
  DOUBAO_USER_AGENT,
  DOUBAO_WEBSOCKET_URL,
} from "./constants";
import {
  type DoubaoCredentialsOptions,
  ensureDoubaoCredentials,
} from "./credentials";
import {
  buildStartSessionMessage,
  buildStartTaskMessage,
  decodeDoubaoResponse,
} from "./proto";
import {
  DoubaoSessionHandle,
  openDoubaoWebSocket,
  readNextSocketMessage,
  sendBinary,
} from "./session";
import { withTimeout } from "./timeout";

interface DoubaoProviderOptions extends DoubaoCredentialsOptions {
  readonly requestTimeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface ResolvedDoubaoProviderOptions {
  readonly credentialPath: string;
  readonly deviceId: string;
  readonly token: string;
  readonly userAgent: string;
  readonly requestTimeoutMs: number;
  readonly fetchImpl: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function buildSessionPayload(deviceId: string): string {
  return JSON.stringify({
    audio_info: {
      channel: DEFAULT_AUDIO_CONFIG.channels,
      format: "speech_opus",
      sample_rate: DEFAULT_AUDIO_CONFIG.sampleRate,
    },
    enable_punctuation: true,
    enable_speech_rejection: false,
    extra: {
      app_name: DOUBAO_APP_NAME,
      cell_compress_rate: 8,
      did: deviceId,
      enable_asr_threepass: true,
      enable_asr_twopass: true,
      input_mode: "tool",
    },
  });
}

function buildWebSocketUrl(deviceId: string): string {
  const params = new URLSearchParams({
    aid: DOUBAO_AID,
    device_id: deviceId,
  });
  return `${DOUBAO_WEBSOCKET_URL}?${params.toString()}`;
}

function buildWebSocketHeaders(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    "proto-version": "v2",
    "x-custom-keepalive": "true",
  };
}

async function expectLifecycleMessage(
  ws: Awaited<ReturnType<typeof openDoubaoWebSocket>>,
  expectedType: string,
  timeoutMs: number,
): Promise<void> {
  const response = decodeDoubaoResponse(
    await withTimeout(
      readNextSocketMessage(ws),
      timeoutMs,
      `Doubao ${expectedType} wait`,
    ),
  );
  if (response.messageType === expectedType) {
    return;
  }
  if (
    response.messageType === "TaskFailed" ||
    response.messageType === "SessionFailed"
  ) {
    throw new Error(
      response.statusMessage || `Doubao lifecycle failed at ${expectedType}`,
    );
  }
  throw new Error(
    `Unexpected Doubao lifecycle message: ${response.messageType || "unknown"}`,
  );
}

function resolveProviderOptions(
  options: DoubaoProviderOptions,
): ResolvedDoubaoProviderOptions {
  const envTimeout = Number.parseInt(
    env("HUB_RUN_DOUBAO_ASR_REQUEST_TIMEOUT_MS") ?? "",
    10,
  );

  return {
    credentialPath:
      options.credentialPath ??
      env("HUB_RUN_DOUBAO_ASR_CREDENTIAL_PATH") ??
      DOUBAO_CREDENTIAL_PATH,
    deviceId: options.deviceId ?? env("HUB_RUN_DOUBAO_ASR_DEVICE_ID") ?? "",
    token: options.token ?? env("HUB_RUN_DOUBAO_ASR_TOKEN") ?? "",
    userAgent: options.userAgent ?? DOUBAO_USER_AGENT,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    requestTimeoutMs:
      options.requestTimeoutMs ??
      (Number.isFinite(envTimeout) && envTimeout > 0
        ? envTimeout
        : DOUBAO_REQUEST_TIMEOUT_MS),
    sleep:
      options.sleep ??
      (async (ms: number) => {
        await new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
      }),
  };
}

function assertSupportedAudio(
  sampleRate: number,
  channels: number,
  encoding: string,
): void {
  if (encoding !== "pcm_s16le") {
    throw new AsrServiceError(
      "ASR_INVALID_REQUEST",
      "Doubao ASR only supports pcm_s16le input",
      400,
    );
  }
  if (sampleRate !== 16_000 || channels !== 1) {
    throw new AsrServiceError(
      "ASR_INVALID_REQUEST",
      "Doubao ASR requires 16kHz mono PCM input",
      400,
    );
  }
}

export function createDoubaoAsrProvider(
  options: DoubaoProviderOptions = {},
): AsrProvider {
  const resolved = resolveProviderOptions(options);

  return {
    summary: {
      id: "doubao",
      label: "Doubao ASR",
      description: "Doubao IME websocket speech recognition provider",
      inputCapabilities: {
        supportedEncodings: ["pcm_s16le"],
        supportedSampleRates: [16_000],
        supportedChannels: [1],
      },
    },
    async startSession(input, onEvent) {
      assertSupportedAudio(input.sampleRate, input.channels, input.encoding);
      const audioConfig = resolveAudioConfig(input.sampleRate, input.channels);
      const credentials = await ensureDoubaoCredentials({
        credentialPath: resolved.credentialPath,
        deviceId: resolved.deviceId || undefined,
        token: resolved.token || undefined,
        userAgent: resolved.userAgent,
        requestTimeoutMs: resolved.requestTimeoutMs,
        fetchImpl: resolved.fetchImpl,
      });
      const ws = await openDoubaoWebSocket(
        buildWebSocketUrl(credentials.deviceId),
        buildWebSocketHeaders(resolved.userAgent),
        resolved.requestTimeoutMs,
      );
      const requestId = randomUUID();

      try {
        await sendBinary(
          ws,
          buildStartTaskMessage(requestId, credentials.token),
        );
        await expectLifecycleMessage(
          ws,
          "TaskStarted",
          resolved.requestTimeoutMs,
        );
        await sendBinary(
          ws,
          buildStartSessionMessage(
            requestId,
            credentials.token,
            buildSessionPayload(credentials.deviceId),
          ),
        );
        await expectLifecycleMessage(
          ws,
          "SessionStarted",
          resolved.requestTimeoutMs,
        );
        return new DoubaoSessionHandle({
          ws,
          requestId,
          token: credentials.token,
          audioConfig,
          emit: onEvent,
          sleep: resolved.sleep,
        });
      } catch (error) {
        ws.close();
        throw error;
      }
    },
  };
}
