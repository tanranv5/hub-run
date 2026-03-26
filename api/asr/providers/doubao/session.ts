import { once } from "node:events";
import type { RawData } from "ws";
import WebSocket from "ws";
import type { AsrProviderEvent, AsrProviderHandle } from "../../types";
import {
  createOpusEncoder,
  createSilenceFrame,
  encodeOpusFrame,
  padFrame,
  type DoubaoAudioConfig,
} from "./audio";
import { DOUBAO_REQUEST_TIMEOUT_MS } from "./constants";
import { buildFinishSessionMessage, buildTaskRequestMessage, FRAME_STATE } from "./proto";
import { classifyDoubaoResponse } from "./response";
import { decodeDoubaoResponse } from "./proto";
import { withTimeout } from "./timeout";

const WEBSOCKET_OPEN_LABEL = "Doubao websocket open";

async function waitForWebSocketOpen(ws: WebSocket): Promise<void> {
  await Promise.race([
    once(ws, "open").then(() => undefined),
    once(ws, "error").then((args) => {
      throw args[0] as Error;
    }),
  ]);
}

export async function openDoubaoWebSocket(
  url: string,
  headers: Record<string, string>,
  timeoutMs = DOUBAO_REQUEST_TIMEOUT_MS,
): Promise<WebSocket> {
  const ws = new WebSocket(url, { headers });
  try {
    await withTimeout(waitForWebSocketOpen(ws), timeoutMs, WEBSOCKET_OPEN_LABEL);
    return ws;
  } catch (error) {
    ws.close();
    throw error;
  }
}

export function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error("Unsupported Doubao websocket payload type");
}

export async function sendBinary(
  ws: WebSocket,
  payload: Uint8Array,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.send(payload, { binary: true }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function readNextSocketMessage(ws: WebSocket): Promise<Buffer> {
  const payload = await Promise.race([
    once(ws, "message"),
    once(ws, "error").then((args) => {
      throw args[0] as Error;
    }),
    once(ws, "close").then(([code, reason]) => {
      throw new Error(
        `Doubao websocket closed before message (code=${String(code)}, reason=${String(reason)})`,
      );
    }),
  ]);
  return toBuffer(payload[0] as RawData);
}

interface DoubaoSessionHandleOptions {
  readonly ws: WebSocket;
  readonly requestId: string;
  readonly token: string;
  readonly audioConfig: DoubaoAudioConfig;
  readonly emit: (event: AsrProviderEvent) => void;
  readonly sleep: (ms: number) => Promise<void>;
}

export class DoubaoSessionHandle implements AsrProviderHandle {
  private readonly encoder;
  private pcmBuffer = Buffer.alloc(0);
  private sendQueue = Promise.resolve();
  private frameIndex = 0;
  private finishRequested = false;
  private closed = false;
  private terminalSeen = false;
  private disposed = false;
  private readonly startedAtMs = Date.now();

  constructor(private readonly options: DoubaoSessionHandleOptions) {
    this.encoder = createOpusEncoder(options.audioConfig);
    this.attachReceiver();
  }

  appendAudio(chunk: Uint8Array): Promise<void> {
    return this.enqueue(async () => {
      this.assertWritable();
      this.pcmBuffer = Buffer.concat([this.pcmBuffer, Buffer.from(chunk)]);
      while (this.pcmBuffer.byteLength >= this.options.audioConfig.bytesPerFrame) {
        const frame = this.pcmBuffer.subarray(
          0,
          this.options.audioConfig.bytesPerFrame,
        );
        this.pcmBuffer = this.pcmBuffer.subarray(
          this.options.audioConfig.bytesPerFrame,
        );
        const frameState =
          this.frameIndex === 0 ? FRAME_STATE.FIRST : FRAME_STATE.MIDDLE;
        await this.sendFrame(frame, frameState, true);
      }
    });
  }

  finish(): Promise<void> {
    return this.enqueue(async () => {
      this.assertWritable();
      this.finishRequested = true;
      await this.sendFinalFrame();
      await sendBinary(
        this.options.ws,
        buildFinishSessionMessage(this.options.requestId, this.options.token),
      );
    });
  }

  cancel(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    this.closed = true;
    this.options.ws.close();
    this.dispose();
    return Promise.resolve();
  }

  private attachReceiver(): void {
    this.options.ws.on("message", (data: RawData) => {
      if (this.closed) {
        return;
      }
      const decoded = decodeDoubaoResponse(toBuffer(data));
      const event = classifyDoubaoResponse({
        message_type: decoded.messageType,
        status_message: decoded.statusMessage,
        result_json: decoded.resultJson,
      });
      if (event.type === "heartbeat") {
        return;
      }
      if (event.type === "session_finished" || event.type === "error") {
        this.terminalSeen = true;
        this.closed = true;
      }
      this.options.emit(event);
      if (this.terminalSeen) {
        this.options.ws.close();
        this.dispose();
      }
    });

    this.options.ws.on("error", (error: Error) => {
      if (this.closed) {
        return;
      }
      this.closed = true;
      this.options.emit({ type: "error", error: error.message });
      this.dispose();
    });

    this.options.ws.on("close", () => {
      if (this.disposed) {
        return;
      }
      if (!this.closed && !this.terminalSeen) {
        this.options.emit({
          type: "error",
          error: "Doubao ASR websocket closed unexpectedly",
        });
      }
      this.closed = true;
      this.dispose();
    });
  }

  private async sendFinalFrame(): Promise<void> {
    const frame =
      this.pcmBuffer.byteLength > 0
        ? padFrame(this.pcmBuffer, this.options.audioConfig)
        : createSilenceFrame(this.options.audioConfig);
    this.pcmBuffer = Buffer.alloc(0);
    await this.sendFrame(frame, FRAME_STATE.LAST, false);
  }

  private async sendFrame(
    frame: Uint8Array,
    frameState: number,
    waitAfterSend: boolean,
  ): Promise<void> {
    if (this.closed) {
      return;
    }
    const opusFrame = encodeOpusFrame(
      this.encoder,
      frame,
      this.options.audioConfig,
    );
    const timestampMs =
      this.startedAtMs +
      this.frameIndex * this.options.audioConfig.frameDurationMs;
    await sendBinary(
      this.options.ws,
      buildTaskRequestMessage(
        this.options.requestId,
        opusFrame,
        frameState,
        timestampMs,
      ),
    );
    this.frameIndex += 1;
    if (waitAfterSend && !this.closed) {
      await this.options.sleep(this.options.audioConfig.frameDurationMs);
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const nextTask = this.sendQueue.then(task);
    this.sendQueue = nextTask.catch(() => undefined);
    return nextTask;
  }

  private assertWritable(): void {
    if (this.closed || this.finishRequested) {
      throw new Error("Doubao ASR session is closed");
    }
  }

  private dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.encoder.delete();
  }
}
