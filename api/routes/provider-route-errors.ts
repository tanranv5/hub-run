import type { ProviderError, ProviderErrorCode } from "../types";

const SESSION_NOT_FOUND_PATTERNS = [
  "thread not found",
  "thread not loaded",
  "session not found",
  "session project path is missing",
  "request not found",
  "missing session",
];

const TRANSPORT_UNAVAILABLE_PATTERNS = [
  "transport unavailable",
  "cli not found",
  "cli not available",
  "enoent",
  "spawn",
  "econnrefused",
  "connect econnrefused",
];

const BAD_REQUEST_PATTERNS = [
  "is required",
  "must be",
  "invalid",
  "cannot be empty",
  "missing",
];

interface ProviderRouteErrorResult {
  error: ProviderError;
  status: ProviderRouteStatus;
}

type ProviderRouteStatus = 400 | 404 | 500 | 502 | 503;

export function resolveProviderRouteError(
  error: unknown,
  fallbackMessage: string,
  badRequestPatterns: string[] = [],
): ProviderRouteErrorResult {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const normalized = message.toLowerCase();
  if (badRequestPatterns.some((pattern) => normalized.includes(pattern))) {
    return buildProviderRouteError("INTERNAL_ERROR", message, 400);
  }
  if (SESSION_NOT_FOUND_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return buildProviderRouteError("SESSION_NOT_FOUND", message, 404);
  }
  if (TRANSPORT_UNAVAILABLE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return buildProviderRouteError("TRANSPORT_UNAVAILABLE", message, 502);
  }
  if (BAD_REQUEST_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return buildProviderRouteError("PARSE_FAILED", message, 400);
  }
  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return buildProviderRouteError("TRANSPORT_UNAVAILABLE", message, 503);
  }
  return buildProviderRouteError("INTERNAL_ERROR", message, 500);
}

function buildProviderRouteError(
  code: ProviderErrorCode,
  message: string,
  status: ProviderRouteStatus,
): ProviderRouteErrorResult {
  return {
    error: {
      code,
      message,
    },
    status,
  };
}
