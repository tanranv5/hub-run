export type AsrErrorCode =
  | "ASR_PROVIDER_NOT_FOUND"
  | "ASR_SESSION_NOT_FOUND"
  | "ASR_INVALID_REQUEST"
  | "ASR_SESSION_CLOSED"
  | "ASR_INTERNAL_ERROR";

export class AsrServiceError extends Error {
  constructor(
    readonly code: AsrErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AsrServiceError";
  }
}
