import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DOUBAO_CREDENTIAL_PATH,
  DOUBAO_REQUEST_TIMEOUT_MS,
  DOUBAO_USER_AGENT,
} from "./constants";
import {
  fetchDoubaoAsrToken,
  registerDoubaoDevice,
} from "./credentials-http";

export interface DoubaoCredentials {
  readonly deviceId: string;
  readonly token: string;
  readonly cdid: string;
  readonly openudid: string;
  readonly clientudid: string;
}

export interface DoubaoCredentialsOptions {
  readonly credentialPath?: string;
  readonly deviceId?: string;
  readonly token?: string;
  readonly userAgent?: string;
  readonly requestTimeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

async function readCredentialsFile(path: string): Promise<DoubaoCredentials | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<DoubaoCredentials>;
    if (
      !parsed.deviceId ||
      !parsed.token ||
      !parsed.cdid ||
      !parsed.openudid ||
      !parsed.clientudid
    ) {
      throw new Error("credential file is incomplete");
    }
    return {
      deviceId: parsed.deviceId,
      token: parsed.token,
      cdid: parsed.cdid,
      openudid: parsed.openudid,
      clientudid: parsed.clientudid,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeCredentialsFile(
  path: string,
  credentials: DoubaoCredentials,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(credentials, null, 2), "utf-8");
}

function credentialsChanged(
  current: DoubaoCredentials | null,
  next: DoubaoCredentials,
): boolean {
  if (!current) {
    return true;
  }
  return (
    current.deviceId !== next.deviceId ||
    current.token !== next.token ||
    current.cdid !== next.cdid ||
    current.openudid !== next.openudid ||
    current.clientudid !== next.clientudid
  );
}

export async function ensureDoubaoCredentials(
  options: DoubaoCredentialsOptions = {},
): Promise<DoubaoCredentials> {
  const credentialPath = options.credentialPath ?? DOUBAO_CREDENTIAL_PATH;
  const userAgent = options.userAgent ?? DOUBAO_USER_AGENT;
  const requestTimeoutMs = options.requestTimeoutMs ?? DOUBAO_REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const fileCredentials = await readCredentialsFile(credentialPath);
  const deviceId = options.deviceId?.trim() || null;
  const token = options.token?.trim() || null;
  const hasCredentialOverride = deviceId !== null || token !== null;
  const deviceIdChanged =
    !!deviceId &&
    !!fileCredentials?.deviceId &&
    fileCredentials.deviceId !== deviceId;

  const current = {
    deviceId: deviceId ?? fileCredentials?.deviceId ?? null,
    token:
      token ??
      (deviceIdChanged ? null : (fileCredentials?.token ?? null)),
    cdid: fileCredentials?.cdid ?? randomUUID(),
    openudid: fileCredentials?.openudid ?? randomBytes(8).toString("hex"),
    clientudid: fileCredentials?.clientudid ?? randomUUID(),
  };

  let registered = false;
  if (!current.deviceId) {
    const fresh = await registerDoubaoDevice(
      userAgent,
      requestTimeoutMs,
      fetchImpl,
    );
    current.deviceId = fresh.deviceId;
    current.cdid = fresh.cdid;
    current.openudid = fresh.openudid;
    current.clientudid = fresh.clientudid;
    registered = true;
  }

  if (!current.token) {
    current.token = await fetchDoubaoAsrToken(
      current.deviceId,
      current.cdid,
      userAgent,
      requestTimeoutMs,
      fetchImpl,
    );
    registered = true;
  }

  const credentials: DoubaoCredentials = {
    deviceId: current.deviceId,
    token: current.token,
    cdid: current.cdid,
    openudid: current.openudid,
    clientudid: current.clientudid,
  };

  if (
    !hasCredentialOverride &&
    (registered || credentialsChanged(fileCredentials, credentials))
  ) {
    await writeCredentialsFile(credentialPath, credentials);
  }
  return credentials;
}
