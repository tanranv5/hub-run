import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { encodeSessionKey } from "../session-ref";
import type {
  ConversationPage,
  CreateSessionInput,
  CreateSessionResult,
  ProviderModelOption,
  ProviderSessionContext,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderError,
  ProviderId,
  ProviderStatus,
  ProviderSummary,
  SendMessageInput,
  SessionRef,
  SessionSummary,
  ProviderThreadState,
  ProviderUserInputRequest,
  ProviderUserInputResponsePayload,
} from "../types";
import { createClaudeProvider } from "./sources/claude";
import { createCodexProvider } from "./sources/codex";
import { isClaudeCliAvailable } from "./transports/claude-cli";
import { isCodexTransportAvailable } from "./transports/codex-app-server";

interface RegistryDependencies {
  pathExists?: (path: string) => boolean;
  codexSendAvailable?: boolean | (() => boolean);
  claudeSendAvailable?: boolean | (() => boolean);
}

interface AdapterSource {
  id: ProviderId;
  label: string;
  description: string;
  rootPath: string;
  readSessions: () => Promise<SessionSummary[]>;
  readProjects: () => Promise<string[]>;
  listModels: () => Promise<ProviderModelOption[]>;
  readConversationPage: (
    sessionId: string,
    before: string | null,
    limit: number,
  ) => Promise<ConversationPage>;
  createSession: (input: CreateSessionInput) => Promise<CreateSessionResult>;
  sendMessage: (sessionId: string, input: SendMessageInput) => Promise<{
    turnId: string | null;
    outputText: string | null;
  }>;
  canCreateSession: boolean;
  supportsEmptyCreateSession: boolean;
  supportsModelSelection: boolean;
  supportsThreadState?: boolean;
  supportsInterrupt?: boolean;
  supportsUserInput?: boolean;
  supportsStream?: boolean;
  deleteSession?: (sessionId: string) => Promise<void>;
  getSessionFileMtime?: (sessionId: string) => Promise<number | null>;
  getThreadState?: (
    sessionId: string,
    requestedTurnId?: string | null,
  ) => Promise<ProviderThreadState>;
  getSessionContext?: (sessionId: string) => Promise<ProviderSessionContext>;
  interruptSession?: (sessionId: string) => Promise<void>;
  listUserInputRequests?: (sessionId: string) => Promise<ProviderUserInputRequest[]>;
  submitUserInput?: (
    sessionId: string,
    requestId: string,
    response: ProviderUserInputResponsePayload,
  ) => Promise<void>;
  subscribeSessions?: (onChange: () => void) => () => void;
  subscribeConversation?: (
    sessionId: string,
    onChange: () => void,
  ) => () => void;
  getConversationStream?: (
    sessionId: string,
    offset: number,
  ) => Promise<{ messages: ConversationPage["messages"]; nextOffset: number }>;
  getConversationStreamCursor?: (sessionId: string) => Promise<number>;
}

function createMissingConfigError(rootPath: string): ProviderError {
  return {
    code: "CONFIG_MISSING",
    message: `Missing provider directory: ${rootPath}`,
  };
}

function getBootstrappedError(
  pathExists: boolean,
  sendAvailable: boolean,
): ProviderError | null {
  if (!pathExists) {
    return null;
  }

  if (!sendAvailable) {
    return {
      code: "TRANSPORT_UNAVAILABLE",
      message: "Send transport is unavailable",
    };
  }

  return null;
}

function getCapabilities(
  pathExists: boolean,
  sendAvailable: boolean,
  canCreateSession: boolean,
  supportsEmptyCreateSession: boolean,
  supportsModelSelection: boolean,
  supportsStream: boolean,
  supportsThreadState: boolean,
  supportsInterrupt: boolean,
  supportsUserInput: boolean,
  supportsDeleteSession: boolean,
): ProviderCapabilities {
  const createSessionAvailable = pathExists && canCreateSession && sendAvailable;
  return {
    history: pathExists,
    send: pathExists && sendAvailable,
    stream: pathExists && supportsStream,
    attach: pathExists && sendAvailable,
    createSession: createSessionAvailable,
    emptyCreateSession: createSessionAvailable && supportsEmptyCreateSession,
    modelSelection: pathExists && supportsModelSelection && sendAvailable,
    threadState: pathExists && sendAvailable && supportsThreadState,
    interrupt: pathExists && sendAvailable && supportsInterrupt,
    userInput: pathExists && sendAvailable && supportsUserInput,
    deleteSession: pathExists && supportsDeleteSession,
  };
}

function getStatus(
  pathExists: boolean,
  rootPath: string,
  sendAvailable: boolean,
): ProviderStatus {
  return {
    historyReadable: pathExists,
    sendAvailable: pathExists && sendAvailable,
    configResolved: pathExists,
    lastError: pathExists
      ? getBootstrappedError(pathExists, sendAvailable)
      : createMissingConfigError(rootPath),
  };
}

function withSessionKeys(
  providerId: ProviderId,
  sessions: SessionSummary[],
): SessionSummary[] {
  return sessions.map((session) => ({
    ...session,
    sessionKey: encodeSessionKey({
      providerId,
      sessionId: session.id,
      projectPath: session.project,
    } satisfies SessionRef),
  }));
}

function createProviderSummary(
  source: AdapterSource,
  pathExists: boolean,
  sendAvailable: boolean,
): ProviderSummary {
  return {
    id: source.id,
    label: source.label,
    description: source.description,
    rootPath: source.rootPath,
    capabilities: getCapabilities(
      pathExists,
      sendAvailable,
      source.canCreateSession,
      source.supportsEmptyCreateSession,
      source.supportsModelSelection,
      source.supportsStream === true,
      source.supportsThreadState === true,
      source.supportsInterrupt === true,
      source.supportsUserInput === true,
      source.deleteSession != null,
    ),
    status: getStatus(pathExists, source.rootPath, sendAvailable),
  };
}

function resolveBooleanReader(
  value: boolean | (() => boolean) | undefined,
  fallback: () => boolean,
) {
  if (typeof value === "function") {
    return value;
  }
  if (typeof value === "boolean") {
    return () => value;
  }
  return fallback;
}

function createAdapter(
  source: AdapterSource,
  readSummary: () => ProviderSummary,
): ProviderAdapter {
  const summary = readSummary();

  return {
    summary,
    getSummary: readSummary,
    listSessions: async () => withSessionKeys(source.id, await source.readSessions()),
    listProjects: source.readProjects,
    listModels: source.listModels,
    getConversationPage: (sessionId, before, limit) =>
      source.readConversationPage(sessionId, before, limit),
    createSession: source.createSession,
    sendMessage: source.sendMessage,
    ...(source.getThreadState
      ? {
          getThreadState: source.getThreadState,
        }
      : {}),
    ...(source.getSessionContext
      ? {
          getSessionContext: source.getSessionContext,
        }
      : {}),
    ...(source.interruptSession
      ? {
          interruptSession: source.interruptSession,
        }
      : {}),
    ...(source.listUserInputRequests
      ? {
          listUserInputRequests: source.listUserInputRequests,
        }
      : {}),
    ...(source.submitUserInput
      ? {
          submitUserInput: source.submitUserInput,
        }
      : {}),
    ...(source.subscribeSessions
      ? {
          subscribeSessions: source.subscribeSessions,
        }
      : {}),
    ...(source.subscribeConversation
      ? {
          subscribeConversation: source.subscribeConversation,
        }
      : {}),
    ...(source.getConversationStream
      ? {
          getConversationStream: source.getConversationStream,
        }
      : {}),
    ...(source.getConversationStreamCursor
      ? {
          getConversationStreamCursor: source.getConversationStreamCursor,
        }
      : {}),
    ...(source.getSessionFileMtime
      ? {
          getSessionFileMtime: source.getSessionFileMtime,
        }
      : {}),
    ...(source.deleteSession
      ? {
          deleteSession: source.deleteSession,
        }
      : {}),
  };
}

export function createProviderRegistry(
  dependencies: RegistryDependencies = {},
): Record<ProviderId, ProviderAdapter> {
  const home = homedir();
  const codexRoot = join(home, ".codex");
  const claudeRoot = join(home, ".claude");
  const pathExists = dependencies.pathExists ?? existsSync;
  const readCodexSendAvailable = resolveBooleanReader(
    dependencies.codexSendAvailable,
    isCodexTransportAvailable,
  );
  const readClaudeSendAvailable = resolveBooleanReader(
    dependencies.claudeSendAvailable,
    isClaudeCliAvailable,
  );

  const codexSource = createCodexProvider(codexRoot);
  const claudeSource = createClaudeProvider(claudeRoot);

  return {
    codex: createAdapter(
      codexSource,
      () =>
        createProviderSummary(
          codexSource,
          pathExists(codexRoot),
          readCodexSendAvailable(),
        ),
    ),
    claude: createAdapter(
      claudeSource,
      () =>
        createProviderSummary(
          claudeSource,
          pathExists(claudeRoot),
          readClaudeSendAvailable(),
        ),
    ),
  };
}

export function getProviderSummary(adapter: ProviderAdapter): ProviderSummary {
  return adapter.getSummary ? adapter.getSummary() : adapter.summary;
}

export function listProviderSummaries(
  registry: Record<ProviderId, ProviderAdapter>,
): ProviderSummary[] {
  return Object.values(registry).map((adapter) => getProviderSummary(adapter));
}
