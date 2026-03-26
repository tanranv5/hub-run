import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type {
  ProviderUserInputRequest,
  ProviderUserInputResponsePayload,
} from "../../types";
import {
  CodexUserInputStore,
  type JsonRpcRequestId,
  type StoredUserInputRequest,
} from "./codex-app-server-user-input-store";
import {
  CodexAppServerRpcError,
  CodexAppServerTransportError,
} from "./codex-app-server-shared";
import {
  buildThreadState,
  parseRequestUserInputParams,
  validateUserInputResponsePayload,
} from "./codex-app-server-state";
import { shouldRetryAfterResume } from "./codex-app-server-shared";

const DEFAULT_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface PendingUserInputResolution {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class CodexAppServerRpcClient {
  private readonly executablePath: string;
  private readonly userInputStore = new CodexUserInputStore();
  private process: ChildProcessWithoutNullStreams | null = null;
  private stdoutReader: Interface | null = null;
  private stderrReader: Interface | null = null;
  private pending = new Map<number, PendingRequest>();
  private pendingUserInputRequests = new Map<string, StoredUserInputRequest>();
  private pendingUserInputResolutions =
    new Map<string, PendingUserInputResolution>();
  private requestId = 0;
  private initialized = false;
  private initializeInFlight: Promise<void> | null = null;

  public constructor(executablePath: string) {
    this.executablePath = executablePath;
  }

  public async request(method: string, params: unknown): Promise<unknown> {
    this.ensureStarted();
    if (method !== "initialize") {
      await this.ensureInitialized();
    }
    return this.requestRaw(method, params);
  }

  public async listPendingUserInputRequests(
    threadId: string,
  ): Promise<ProviderUserInputRequest[]> {
    const normalizedThreadId = requireText(threadId, "threadId");
    return (await this.syncPendingUserInputRequests(normalizedThreadId)).map(
      stripRawRequestId,
    );
  }

  public async submitUserInput(
    threadId: string,
    requestId: string,
    response: ProviderUserInputResponsePayload,
  ): Promise<void> {
    const normalizedThreadId = requireText(threadId, "threadId");
    const normalizedRequestId = requireText(requestId, "requestId");
    const pendingState = await this.getPendingUserInputRequestState(
      normalizedThreadId,
      normalizedRequestId,
    );
    if (pendingState.stale) {
      throw new Error("stale user input request");
    }
    if (!pendingState.request) {
      throw new Error("request not found");
    }
    const pendingRequest = pendingState.request;

    validateUserInputResponsePayload(response);
    this.ensureStarted();
    await this.ensureInitialized();
    const resolution = this.awaitUserInputResolution(normalizedRequestId);

    try {
      await this.respondToServerRequest(pendingRequest.rawRequestId, response);
      await resolution;
    } catch (error) {
      const transportError = toTransportError(
        error,
        "app-server user input response failed",
      );
      this.rejectPendingUserInputResolution(
        normalizedRequestId,
        transportError,
      );
      if (
        (await this.getPendingUserInputRequestState(
          normalizedThreadId,
          normalizedRequestId,
        )).stale
      ) {
        throw new Error("stale user input request");
      }
      throw error;
    }
  }

  public async close(): Promise<void> {
    this.rejectAll(new CodexAppServerTransportError("app-server closed"));
    if (this.process) {
      this.process.kill("SIGTERM");
    }
    this.reset();
  }

  private ensureStarted(): void {
    if (this.process) {
      return;
    }

    const child = spawn(this.executablePath, ["app-server"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = child;
    this.stdoutReader = createInterface({ input: child.stdout });
    this.stdoutReader.on("line", (line) => this.handleStdoutLine(line));
    this.stderrReader = createInterface({ input: child.stderr });
    this.stderrReader.on("line", () => undefined);
    child.on("error", (error) => this.handleProcessClosed(error.message));
    child.on("close", (code, signal) => {
      this.handleProcessClosed(
        `app-server exited (code=${String(code)}, signal=${String(signal)})`,
      );
    });
  }

  private handleProcessClosed(message: string): void {
    this.rejectAll(new CodexAppServerTransportError(message));
    this.reset();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (this.initializeInFlight) {
      return this.initializeInFlight;
    }

    this.initializeInFlight = this.requestRaw("initialize", {
      clientInfo: { name: "hub-run", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    })
      .then(() => {
        this.initialized = true;
      })
      .finally(() => {
        this.initializeInFlight = null;
      });

    return this.initializeInFlight;
  }

  private requestRaw(method: string, params: unknown): Promise<unknown> {
    if (!this.process) {
      throw new CodexAppServerTransportError("app-server failed to start");
    }

    const id = this.requestId + 1;
    this.requestId = id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new CodexAppServerTransportError(
            `app-server request timed out: ${method}`,
          ),
        );
      }, DEFAULT_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.process!.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
        (error) => {
          if (error) {
            this.rejectPendingRequest(
              id,
              new CodexAppServerTransportError(
                `Failed to write app-server request: ${error.message}`,
              ),
            );
          }
        },
      );
    });
  }

  private handleStdoutLine(line: string): void {
    const message = parseJsonLine(line);
    if (!message) {
      return;
    }
    if (isRpcResponse(message)) {
      this.resolvePendingRequest(message.id, message);
      return;
    }
    if (message.method === "serverRequest/resolved") {
      void this.handleServerRequestResolved(message.params).catch((error) => {
        this.logAsyncHandlerError("serverRequest/resolved", error);
      });
      return;
    }
    if (isServerMethodCall(message)) {
      void this.handleServerMethod(message).catch((error) => {
        this.logAsyncHandlerError(message.method, error);
      });
    }
  }

  private async handleServerMethod(message: {
    id: JsonRpcRequestId;
    method: string;
    params: unknown;
  }): Promise<void> {
    if (
      message.method === "item/tool/requestUserInput" &&
      (await this.handleRequestUserInput(message.id, message.params))
    ) {
      return;
    }
    await this.respondMethodNotFound(message.id, message.method);
  }

  private async handleRequestUserInput(
    requestId: JsonRpcRequestId,
    params: unknown,
  ): Promise<boolean> {
    const normalized = parseRequestUserInputParams(params);
    if (!normalized) {
      return false;
    }

    const request: StoredUserInputRequest = {
      requestId: String(requestId),
      rawRequestId: requestId,
      threadId: normalized.threadId,
      turnId: normalized.turnId,
      itemId: normalized.itemId,
      questions: normalized.questions,
    };
    this.pendingUserInputRequests.set(request.requestId, request);
    await this.userInputStore.upsert(request);
    return true;
  }

  private async handleServerRequestResolved(params: unknown): Promise<void> {
    const requestId = readResolvedRequestId(params);
    if (!requestId) {
      return;
    }

    this.pendingUserInputRequests.delete(requestId);
    this.resolvePendingUserInputResolution(requestId);
    await this.userInputStore.delete(requestId);
  }

  private resolvePendingRequest(
    requestId: number,
    message: Record<string, unknown>,
  ): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (message.error && typeof message.error === "object") {
      const error = message.error as { code?: unknown; message?: unknown };
      pending.reject(
        new CodexAppServerRpcError(
          typeof error.code === "number" ? error.code : -1,
          typeof error.message === "string"
            ? error.message
            : "Unknown RPC error",
        ),
      );
      return;
    }

    pending.resolve(message.result);
  }

  private rejectPendingRequest(requestId: number, error: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private async respondMethodNotFound(
    requestId: JsonRpcRequestId,
    method: string,
  ): Promise<void> {
    await this.writeToServer({
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32601,
        message: `Method not handled by hub-run client: ${method}`,
      },
    });
  }

  private async respondToServerRequest(
    requestId: JsonRpcRequestId,
    result: unknown,
  ): Promise<void> {
    await this.writeToServer({ jsonrpc: "2.0", id: requestId, result });
  }

  private async writeToServer(payload: Record<string, unknown>): Promise<void> {
    if (!this.process) {
      throw new CodexAppServerTransportError("app-server failed to start");
    }

    await new Promise<void>((resolve, reject) => {
      this.process!.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          reject(
            new CodexAppServerTransportError(
              `Failed to write app-server payload: ${error.message}`,
            ),
          );
          return;
        }
        resolve();
      });
    });
  }

  private async getPendingUserInputRequestState(
    threadId: string,
    requestId: string,
  ): Promise<{ request: StoredUserInputRequest | null; stale: boolean }> {
    const known = await this.findKnownPendingUserInputRequest(threadId, requestId);
    if (!known) {
      return { request: null, stale: false };
    }
    const active = await this.syncPendingUserInputRequests(threadId);
    const request = active.find((entry) => entry.requestId === requestId) ?? null;
    return {
      request,
      stale: request === null,
    };
  }

  private async findKnownPendingUserInputRequest(
    threadId: string,
    requestId: string,
  ): Promise<StoredUserInputRequest | null> {
    const inMemory = this.pendingUserInputRequests.get(requestId);
    if (inMemory?.threadId === threadId) {
      return inMemory;
    }

    const stored = await this.userInputStore.get(requestId);
    if (stored?.threadId === threadId) {
      return stored;
    }
    return null;
  }

  private async syncPendingUserInputRequests(
    threadId: string,
  ): Promise<StoredUserInputRequest[]> {
    const requests = mergePendingUserInputRequests(
      await this.userInputStore.listByThread(threadId),
      [...this.pendingUserInputRequests.values()].filter(
        (request) => request.threadId === threadId,
      ),
    );
    if (requests.length === 0) {
      return [];
    }

    let threadWithTurns: unknown;
    try {
      threadWithTurns = await this.readThreadWithTurns(threadId);
    } catch (error) {
      if (!isMissingThreadError(error)) {
        throw error;
      }
      await this.forgetPendingUserInputRequests(requests);
      return [];
    }

    const activeRequests = requests.filter((request) =>
      isUserInputRequestActive(threadId, request, threadWithTurns),
    );
    await this.forgetPendingUserInputRequests(
      requests.filter(
        (request) =>
          !activeRequests.some((entry) => entry.requestId === request.requestId),
      ),
    );
    await Promise.all(
      activeRequests.map((request) => this.userInputStore.upsert(request)),
    );
    return activeRequests;
  }

  private async readThreadWithTurns(threadId: string): Promise<unknown> {
    const params = {
      threadId,
      includeTurns: true,
    };
    try {
      return await this.request("thread/read", params);
    } catch (error) {
      if (!shouldRetryAfterResume(error)) {
        throw error;
      }
      await this.request("thread/resume", {
        threadId,
        persistExtendedHistory: true,
      });
      return this.request("thread/read", params);
    }
  }

  private async forgetPendingUserInputRequests(
    requests: StoredUserInputRequest[],
  ): Promise<void> {
    await Promise.all(
      requests.map((request) => this.forgetPendingUserInputRequest(request.requestId)),
    );
  }

  private async forgetPendingUserInputRequest(requestId: string): Promise<void> {
    this.pendingUserInputRequests.delete(requestId);
    await this.userInputStore.delete(requestId);
  }

  private awaitUserInputResolution(requestId: string): Promise<void> {
    if (this.pendingUserInputResolutions.has(requestId)) {
      throw new CodexAppServerTransportError("user input response already pending");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingUserInputResolutions.delete(requestId);
        reject(
          new CodexAppServerTransportError(
            `app-server user input response timed out: ${requestId}`,
          ),
        );
      }, DEFAULT_TIMEOUT_MS);

      this.pendingUserInputResolutions.set(requestId, { resolve, reject, timer });
    });
  }

  private resolvePendingUserInputResolution(requestId: string): void {
    const pending = this.pendingUserInputResolutions.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingUserInputResolutions.delete(requestId);
    pending.resolve();
  }

  private rejectPendingUserInputResolution(
    requestId: string,
    error: Error,
  ): void {
    const pending = this.pendingUserInputResolutions.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingUserInputResolutions.delete(requestId);
    pending.reject(error);
  }

  private rejectAll(error: Error): void {
    for (const [id] of this.pending.entries()) {
      this.rejectPendingRequest(id, error);
    }
    for (const requestId of this.pendingUserInputResolutions.keys()) {
      this.rejectPendingUserInputResolution(requestId, error);
    }
  }

  private reset(): void {
    this.process = null;
    this.pendingUserInputRequests.clear();
    this.stdoutReader?.close();
    this.stderrReader?.close();
    this.stdoutReader = null;
    this.stderrReader = null;
    this.initialized = false;
    this.initializeInFlight = null;
  }

  private logAsyncHandlerError(method: string, error: unknown): void {
    console.error(`codex app-server handler failed: ${method}`, error);
  }
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  const text = line.trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isRpcResponse(
  message: Record<string, unknown>,
): message is Record<string, unknown> & { id: number } {
  return (
    (message.result !== undefined || message.error !== undefined) &&
    typeof message.id === "number"
  );
}

function isServerMethodCall(
  message: Record<string, unknown>,
): message is { id: JsonRpcRequestId; method: string; params: unknown } {
  return (
    (typeof message.id === "number" || typeof message.id === "string") &&
    typeof message.method === "string" &&
    message.params !== undefined
  );
}

function readResolvedRequestId(params: unknown): string | null {
  if (!params || typeof params !== "object") {
    return null;
  }

  const requestId = (params as { requestId?: unknown }).requestId;
  return typeof requestId === "string" || typeof requestId === "number"
    ? String(requestId)
    : null;
}

function stripRawRequestId(
  request: StoredUserInputRequest,
): ProviderUserInputRequest {
  const { rawRequestId: _rawRequestId, ...rest } = request;
  return rest;
}

function mergePendingUserInputRequests(
  stored: StoredUserInputRequest[],
  inMemory: StoredUserInputRequest[],
): StoredUserInputRequest[] {
  const requests = new Map<string, StoredUserInputRequest>();
  for (const request of stored) {
    requests.set(request.requestId, request);
  }
  for (const request of inMemory) {
    requests.set(request.requestId, request);
  }
  return [...requests.values()];
}

function isUserInputRequestActive(
  threadId: string,
  request: StoredUserInputRequest,
  threadWithTurns: unknown,
): boolean {
  const status = buildThreadState(threadId, threadWithTurns, request.turnId)
    .requestedTurnStatus;
  return status === null || status === "inProgress";
}

function isMissingThreadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("thread not found") ||
    message.includes("thread not loaded") ||
    message.includes("not loaded");
}

function requireText(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function toTransportError(error: unknown, message: string): Error {
  if (error instanceof Error) {
    return error;
  }
  return new CodexAppServerTransportError(message);
}
