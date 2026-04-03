import type {
  ProviderModelOption,
  ProviderReasoningEffort,
  SendImageInput,
  ProviderThreadState,
  ProviderUserInputRequest,
  ProviderUserInputResponsePayload,
} from "../../types";
import { CodexAppServerRpcClient } from "./codex-app-server-rpc";
import {
  buildThreadState,
} from "./codex-app-server-state";
import {
  extractThreadId,
  extractTurnId,
  isCodexTransportAvailable,
  parseModelOptions,
  resolveCodexExecutablePath,
  shouldRetryAfterResume,
} from "./codex-app-server-shared";

interface CodexSendInput {
  threadId: string;
  text: string;
  images?: SendImageInput[];
  cwd?: string;
  model?: string | null;
  effort?: ProviderReasoningEffort | null;
}

interface CodexCreateThreadInput {
  cwd: string;
  model?: string | null;
  effort?: ProviderReasoningEffort | null;
}

let client: CodexAppServerRpcClient | null = null;

function getClient() {
  if (!client) {
    client = new CodexAppServerRpcClient(resolveCodexExecutablePath());
  }
  return client;
}

async function resumeThread(threadId: string): Promise<void> {
  await getClient().request("thread/resume", {
    threadId,
    persistExtendedHistory: true,
  });
}

async function readThreadWithTurns(threadId: string): Promise<unknown> {
  const params = {
    threadId,
    includeTurns: true,
  };

  try {
    const result = await getClient().request("thread/read", params);
    if (!shouldResumeThreadReadResult(result)) {
      return result;
    }
    await resumeThread(threadId);
    const resumed = await getClient().request("thread/read", params);
    return resumed;
  } catch (error) {
    if (!shouldRetryAfterResume(error)) {
      throw error;
    }
    await resumeThread(threadId);
    return getClient().request("thread/read", params);
  }
}

export async function listCodexModels(): Promise<ProviderModelOption[]> {
  return parseModelOptions(await getClient().request("model/list", { limit: 50 }));
}

export async function createCodexThread(input: CodexCreateThreadInput): Promise<string> {
  const cwd = input.cwd.trim();
  if (!cwd) {
    throw new Error("cwd is required");
  }

  const params: Record<string, unknown> = { cwd, ephemeral: false };
  if (input.model?.trim()) {
    params.model = input.model.trim();
  }
  if (input.effort) {
    params.config = { model_reasoning_effort: input.effort };
  }

  return extractThreadId(await getClient().request("thread/start", params));
}

export function buildCodexTurnInput(input: {
  text?: string;
  images?: SendImageInput[];
}): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];
  const text = input.text?.trim() ?? "";
  if (text) {
    items.push({ type: "text", text, text_elements: [] });
  }
  for (const image of input.images ?? []) {
    const url = image.url.trim();
    if (!url) {
      continue;
    }
    items.push({ type: "image", url });
  }
  return items;
}

export async function sendCodexMessage(input: CodexSendInput): Promise<{ turnId: string | null }> {
  const threadId = input.threadId.trim();
  if (!threadId) {
    throw new Error("threadId is required");
  }
  const turnInput = buildCodexTurnInput(input);
  if (turnInput.length === 0) {
    throw new Error("text or images is required");
  }

  const params: Record<string, unknown> = {
    threadId,
    input: turnInput,
    attachments: [],
  };
  if (input.cwd?.trim()) {
    params.cwd = input.cwd.trim();
  }
  if (input.model?.trim()) {
    params.model = input.model.trim();
  }
  if (input.effort) {
    params.effort = input.effort;
  }

  try {
    return { turnId: extractTurnId(await getClient().request("turn/start", params)) };
  } catch (error) {
    if (!shouldRetryAfterResume(error)) {
      throw error;
    }
    await resumeThread(threadId);
    return { turnId: extractTurnId(await getClient().request("turn/start", params)) };
  }
}

export async function getCodexThreadState(
  threadId: string,
  requestedTurnId?: string | null,
): Promise<ProviderThreadState> {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    throw new Error("threadId is required");
  }

  return buildThreadState(
    normalizedThreadId,
    await readThreadWithTurns(normalizedThreadId),
    requestedTurnId,
  );
}

export async function interruptCodexThread(threadId: string): Promise<void> {
  const threadState = await getCodexThreadState(threadId);
  const interruptTurnId = resolveInterruptTurnId(threadState);
  if (!interruptTurnId) {
    return;
  }

  try {
    await getClient().request("turn/interrupt", {
      threadId: threadState.threadId,
      turnId: interruptTurnId,
    });
  } catch (error) {
    if (!shouldRetryAfterResume(error)) {
      throw error;
    }
    await resumeThread(threadState.threadId);
    const refreshedState = await getCodexThreadState(threadState.threadId);
    const refreshedInterruptTurnId = resolveInterruptTurnId(refreshedState);
    if (!refreshedInterruptTurnId) {
      return;
    }
    await getClient().request("turn/interrupt", {
      threadId: refreshedState.threadId,
      turnId: refreshedInterruptTurnId,
    });
  }
}

export async function listCodexUserInputRequests(
  threadId: string,
): Promise<ProviderUserInputRequest[]> {
  return getClient().listPendingUserInputRequests(threadId);
}

export async function submitCodexUserInput(
  threadId: string,
  requestId: string,
  response: ProviderUserInputResponsePayload,
): Promise<void> {
  return getClient().submitUserInput(threadId, requestId, response);
}

export async function closeCodexAppServerClient(): Promise<void> {
  if (!client) {
    return;
  }
  await client.close();
  client = null;
}

export { isCodexTransportAvailable };

export function shouldResumeThreadReadResult(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }
  const thread = (result as { thread?: unknown }).thread;
  if (!thread || typeof thread !== "object") {
    return false;
  }
  return (thread as { status?: { type?: unknown } }).status?.type === "notLoaded";
}

export function resolveInterruptTurnId(threadState: ProviderThreadState): string | null {
  if (threadState.activeTurnId) {
    return threadState.activeTurnId;
  }
  if (
    threadState.requestedTurnId &&
    (threadState.stalled || threadState.requestedTurnStatus === null)
  ) {
    return threadState.requestedTurnId;
  }
  return null;
}
