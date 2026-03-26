export type AsrAudioEncoding = string;

export type AsrEventType =
  | "session_started"
  | "vad_start"
  | "interim_result"
  | "final_result"
  | "session_finished"
  | "session_cancelled"
  | "error"
  | "heartbeat";

export type AsrSessionStatus =
  | "starting"
  | "running"
  | "finishing"
  | "finished"
  | "cancelled"
  | "failed";

export interface AsrProviderInputCapabilities {
  readonly supportedEncodings?: readonly AsrAudioEncoding[];
  readonly supportedSampleRates?: readonly number[];
  readonly supportedChannels?: readonly number[];
}

export interface AsrProviderSummary {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly inputCapabilities?: AsrProviderInputCapabilities;
}

export interface AsrSessionStartInput {
  readonly providerId: string;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly encoding?: AsrAudioEncoding;
}

export interface AsrProviderEvent {
  readonly type: AsrEventType;
  readonly text?: string;
  readonly error?: string;
  readonly raw?: unknown;
}

export interface AsrSessionEvent extends AsrProviderEvent {
  readonly eventId: number;
  readonly sessionId: string;
  readonly providerId: string;
  readonly timestamp: string;
}

export interface AsrSession {
  readonly sessionId: string;
  readonly providerId: string;
  readonly status: AsrSessionStatus;
  readonly sampleRate: number;
  readonly channels: number;
  readonly encoding: AsrAudioEncoding;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastEventId: number;
  readonly errorMessage: string | null;
}

export interface AsrProviderHandle {
  appendAudio(chunk: Uint8Array): Promise<void>;
  finish(): Promise<void>;
  cancel(): Promise<void>;
}

export interface AsrProvider {
  readonly summary: AsrProviderSummary;
  startSession(
    input: Required<Omit<AsrSessionStartInput, "providerId">>,
    onEvent: (event: AsrProviderEvent) => void,
  ): Promise<AsrProviderHandle>;
}

export type AsrRegistry = Record<string, AsrProvider>;

export type AsrSessionSubscriber = (event: AsrSessionEvent) => void;

export interface AsrService {
  listProviders(): AsrProviderSummary[];
  createSession(input: AsrSessionStartInput): Promise<AsrSession>;
  getSession(sessionId: string): AsrSession;
  appendAudio(sessionId: string, chunk: Uint8Array): Promise<AsrSession>;
  finishSession(sessionId: string): Promise<AsrSession>;
  cancelSession(sessionId: string): Promise<AsrSession>;
  readEventsAfter(sessionId: string, afterEventId: number): AsrSessionEvent[];
  subscribe(sessionId: string, subscriber: AsrSessionSubscriber): () => void;
}
