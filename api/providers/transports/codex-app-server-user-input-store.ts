import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProviderUserInputRequest } from "../../types";

const DEFAULT_STATE_DIR = ".config/hub-run";
const STORE_FILE_NAME = "codex-user-input.json";

export type JsonRpcRequestId = string | number;

export interface StoredUserInputRequest extends ProviderUserInputRequest {
  rawRequestId: JsonRpcRequestId;
}

export function getCodexUserInputStorePath(
  env: NodeJS.ProcessEnv = process.env,
) {
  const override = env["HUB_RUN_STATE_DIR"]?.trim();
  if (override) {
    return join(override, STORE_FILE_NAME);
  }

  const home = env["HOME"]?.trim();
  if (!home) {
    throw new Error("HOME is required to resolve hub-run state");
  }
  return join(home, DEFAULT_STATE_DIR, STORE_FILE_NAME);
}

export class CodexUserInputStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  public constructor(filePath = getCodexUserInputStorePath()) {
    this.filePath = filePath;
  }

  public async listByThread(threadId: string): Promise<StoredUserInputRequest[]> {
    await this.flushWrites();
    return (await readStoreFile(this.filePath)).filter((request) => request.threadId === threadId);
  }

  public async get(requestId: string): Promise<StoredUserInputRequest | null> {
    await this.flushWrites();
    return (await readStoreFile(this.filePath)).find((request) => request.requestId === requestId) ?? null;
  }

  public async upsert(request: StoredUserInputRequest): Promise<void> {
    await this.enqueueMutation((current) => upsertRequest(current, request));
  }

  public async delete(requestId: string): Promise<void> {
    await this.enqueueMutation((current) =>
      current.filter((request) => request.requestId !== requestId),
    );
  }

  private async flushWrites(): Promise<void> {
    await this.writeQueue;
  }

  private async enqueueMutation(
    mutate: (current: StoredUserInputRequest[]) => StoredUserInputRequest[],
  ): Promise<void> {
    const run = this.writeQueue.then(async () => {
      const current = await readStoreFile(this.filePath);
      await writeStoreFile(this.filePath, mutate(current));
    });
    this.writeQueue = run.catch(() => undefined);
    await run;
  }
}

async function readStoreFile(filePath: string): Promise<StoredUserInputRequest[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("codex user input store must be an array");
    }
    return parsed.map(readStoredRequest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeStoreFile(
  filePath: string,
  requests: StoredUserInputRequest[],
): Promise<void> {
  await mkdir(getParentDir(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(requests, null, 2)}\n`, "utf-8");
}

function upsertRequest(
  current: StoredUserInputRequest[],
  request: StoredUserInputRequest,
) {
  const next = current.filter((entry) => entry.requestId !== request.requestId);
  next.push(request);
  return next;
}

function getParentDir(filePath: string) {
  const boundary = filePath.lastIndexOf("/");
  return boundary >= 0 ? filePath.slice(0, boundary) : ".";
}

function readStoredRequest(value: unknown): StoredUserInputRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid codex user input store entry");
  }

  const record = value as Record<string, unknown>;
  const rawRequestId = record.rawRequestId;
  if (
    (typeof rawRequestId !== "string" || !rawRequestId.trim()) &&
    typeof rawRequestId !== "number"
  ) {
    throw new Error("codex user input store entry is missing rawRequestId");
  }

  if (!Array.isArray(record.questions)) {
    throw new Error("codex user input store entry is missing questions");
  }

  return {
    requestId: requireText(record.requestId, "requestId"),
    rawRequestId,
    threadId: requireText(record.threadId, "threadId"),
    turnId: requireText(record.turnId, "turnId"),
    itemId: requireText(record.itemId, "itemId"),
    questions: record.questions as ProviderUserInputRequest["questions"],
  };
}

function requireText(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`codex user input store entry is missing ${fieldName}`);
  }
  return value.trim();
}
