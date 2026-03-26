declare module "ws" {
  import { EventEmitter } from "node:events";

  export type RawData = Buffer | ArrayBuffer | Uint8Array | Buffer[];

  export interface WebSocketOptions {
    readonly headers?: Record<string, string>;
  }

  export interface SendOptions {
    readonly binary?: boolean;
  }

  export default class WebSocket extends EventEmitter {
    constructor(url: string, options?: WebSocketOptions);
    close(): void;
    send(
      data: Uint8Array | Buffer | string,
      options: SendOptions,
      callback: (error?: Error) => void,
    ): void;
    on(event: "open", listener: () => void): this;
    on(event: "message", listener: (data: RawData) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(
      event: "close",
      listener: (code?: number, reason?: Buffer) => void,
    ): this;
  }
}
