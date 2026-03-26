export interface HubRunOptions {
  host: string;
  port: number;
  password?: string;
  trustedOrigins?: string[];
  dev?: boolean;
  open?: boolean;
}

export interface RuntimeConfig {
  host: string;
  port: number;
  dev: boolean;
  open: boolean;
  password?: string;
  trustedOrigins: string[];
  authEnabled: boolean;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    throw new Error(`Invalid trusted origin: ${origin}`);
  }
}

function normalizePassword(password: string | undefined): string | undefined {
  const trimmed = password?.trim();
  return trimmed || undefined;
}

export function buildRuntimeConfig(options: HubRunOptions): RuntimeConfig {
  const host = options.host?.trim();
  if (!host) {
    throw new Error("Host is required");
  }

  const port = options.port;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("Port must be an integer between 1 and 65535");
  }

  const password = normalizePassword(options.password);
  if (!isLoopbackHost(host) && !password) {
    throw new Error("Password is required when host is not loopback");
  }

  return {
    host,
    port,
    dev: options.dev ?? false,
    open: options.open ?? true,
    password,
    trustedOrigins: (options.trustedOrigins ?? []).map(normalizeOrigin),
    authEnabled: Boolean(password),
  };
}
