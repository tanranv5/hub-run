import type { SessionRef } from "./types";

function isSessionRef(value: unknown): value is SessionRef {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.providerId === "codex" || candidate.providerId === "claude") &&
    typeof candidate.sessionId === "string" &&
    candidate.sessionId.length > 0 &&
    typeof candidate.projectPath === "string"
  );
}

export function encodeSessionKey(ref: SessionRef): string {
  return Buffer.from(JSON.stringify(ref), "utf-8").toString("base64url");
}

export function decodeSessionKey(key: string): SessionRef {
  try {
    const parsed = JSON.parse(
      Buffer.from(key, "base64url").toString("utf-8"),
    ) as unknown;

    if (!isSessionRef(parsed)) {
      throw new Error("Invalid session payload");
    }

    return parsed;
  } catch {
    throw new Error("Invalid sessionKey");
  }
}
