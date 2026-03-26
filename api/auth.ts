import { createHmac, hkdfSync, timingSafeEqual } from "crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import type { RuntimeConfig } from "./config";
import { isLoopbackHost } from "./config";
import type { ProviderError } from "./types";

const COOKIE_NAME = "hub_run_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const HKDF_SALT = "hub-run-session-signing-v1";
const HKDF_INFO = "hmac-sha256-session";
const HKDF_KEY_LENGTH = 32;

interface SessionPayload {
  exp: number;
}

interface HostTarget {
  hostname: string;
  port: string;
}

interface OriginCheckResult {
  allowed: boolean;
  origin: string | null;
  requestHost: string | null;
  target: HostTarget;
}

function createProviderError(message: string): ProviderError {
  return {
    code: "AUTH_REQUIRED",
    message,
  };
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
}

function deriveSigningKey(password: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", password, HKDF_SALT, HKDF_INFO, HKDF_KEY_LENGTH),
  );
}

function signPayload(payload: string, password: string): string {
  return createHmac("sha256", deriveSigningKey(password)).update(payload).digest("base64url");
}

function parseToken(token: string): { payload: string; signature: string } {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    throw new Error("Invalid auth token");
  }
  return { payload, signature };
}

function readSessionPayload(token: string, password: string): SessionPayload {
  const parsed = parseToken(token);
  const expected = signPayload(parsed.payload, password);
  const signatureBuffer = Buffer.from(parsed.signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) {
    throw new Error("Invalid auth signature");
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error("Invalid auth signature");
  }

  const payload = JSON.parse(
    Buffer.from(parsed.payload, "base64url").toString("utf-8"),
  ) as SessionPayload;

  if (payload.exp <= Date.now()) {
    throw new Error("Expired auth token");
  }

  return payload;
}

export function issueSessionToken(password: string): string {
  const payload = encodePayload({
    exp: Date.now() + SESSION_TTL_MS,
  });
  return `${payload}.${signPayload(payload, password)}`;
}

export function validateSessionToken(
  token: string | undefined,
  password: string | undefined,
): boolean {
  if (!token || !password) {
    return false;
  }

  try {
    readSessionPayload(token, password);
    return true;
  } catch {
    return false;
  }
}

function isSecureRequest(c: Context): boolean {
  const forwardedProto = c.req.header("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  try {
    return new URL(c.req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function writeSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    sameSite: "Strict",
    secure: isSecureRequest(c),
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, {
    path: "/",
    secure: isSecureRequest(c),
  });
}

export function isAuthenticated(c: Context, config: RuntimeConfig): boolean {
  if (!config.authEnabled) {
    return true;
  }

  return validateSessionToken(getCookie(c, COOKIE_NAME), config.password);
}

function parseHostHeader(host: string | undefined): HostTarget | null {
  if (!host) {
    return null;
  }

  try {
    const target = new URL(`http://${host}`);
    return {
      hostname: target.hostname,
      port: target.port,
    };
  } catch {
    return null;
  }
}

function getRequestTarget(c: Context, config: RuntimeConfig): HostTarget {
  const fromHeader = parseHostHeader(c.req.header("host"));
  if (fromHeader) {
    return fromHeader;
  }

  return {
    hostname: config.host,
    port: String(config.port),
  };
}

function isSameOriginTarget(origin: URL, target: HostTarget): boolean {
  const sameHost =
    origin.hostname === target.hostname ||
    (isLoopbackHost(origin.hostname) && isLoopbackHost(target.hostname));
  const samePort = origin.port === target.port || (origin.port === "" && target.port === "80");

  return sameHost && samePort;
}

function isTrustedOrigin(origin: URL, config: RuntimeConfig): boolean {
  return config.trustedOrigins.includes(origin.origin);
}

function inspectWriteOrigin(
  c: Context,
  config: RuntimeConfig,
): OriginCheckResult {
  const origin = c.req.header("origin");
  const requestHost = c.req.header("host") ?? null;
  const target = getRequestTarget(c, config);

  if (!origin) {
    return {
      allowed: false,
      origin: null,
      requestHost,
      target,
    };
  }

  try {
    const originUrl = new URL(origin);
    return {
      allowed:
        isSameOriginTarget(originUrl, target) ||
        isTrustedOrigin(originUrl, config),
      origin,
      requestHost,
      target,
    };
  } catch {
    return {
      allowed: false,
      origin,
      requestHost,
      target,
    };
  }
}

export function enforceWriteOrigin(c: Context, config: RuntimeConfig): boolean {
  return inspectWriteOrigin(c, config).allowed;
}

function formatHostTarget(target: HostTarget): string {
  return target.port ? `${target.hostname}:${target.port}` : target.hostname;
}

export function createAuthGuard(config: RuntimeConfig): MiddlewareHandler {
  return async (c, next) => {
    if (!config.authEnabled || isAuthenticated(c, config)) {
      await next();
      return;
    }

    return c.json({ error: createProviderError("Login required") }, 401);
  };
}

export function rejectInvalidWriteOrigin(c: Context, config: RuntimeConfig) {
  const inspected = inspectWriteOrigin(c, config);
  if (inspected.allowed) {
    return null;
  }

  const message = `Origin check failed (origin=${inspected.origin ?? "missing"}, host=${inspected.requestHost ?? "missing"}, target=${formatHostTarget(inspected.target)})`;
  console.warn(message);

  return c.json(
    {
      error: {
        code: "AUTH_REQUIRED",
        message,
      },
    },
    403,
  );
}
