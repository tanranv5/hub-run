import type {
  CreateSessionInput,
  ProviderUserInputResponsePayload,
  SendMessageInput,
  SendMessageResult,
} from "../../types";
import {
  createCodexThread,
  getCodexThreadState,
  interruptCodexThread,
  listCodexUserInputRequests,
  sendCodexMessage,
  submitCodexUserInput,
} from "../transports/codex-app-server";
import { listStaticCodexModels } from "../transports/codex-models";
import { createCodexSessionStore } from "./codex-store";

function hasCodexUserInput(input: Pick<CreateSessionInput, "images" | "text">): boolean {
  const text = input.text?.trim();
  return Boolean(text) || (input.images?.length ?? 0) > 0;
}

export function createCodexProvider(rootPath: string) {
  const store = createCodexSessionStore(rootPath);

  return {
    id: "codex" as const,
    label: "Codex",
    description: "OpenAI Codex CLI provider shell",
    rootPath,
    canCreateSession: true,
    supportsModelSelection: true,
    supportsEmptyCreateSession: false,
    supportsStream: true,
    readSessions: store.listSessions,
    readProjects: store.listProjects,
    listModels: async () => listStaticCodexModels(),
    readConversationPage: store.getConversationPage,
    searchConversation: store.searchConversation,
    searchConversationPage: store.searchConversationPage,
    locateConversation: store.locateConversation,
    readConversationContext: store.readConversationContext,
    subscribeSessions: store.subscribeSessions,
    subscribeConversation: store.subscribeConversation,
    getConversationStream: store.getConversationStream,
    getConversationStreamCursor: store.getConversationStreamCursor,
    getSessionContext: store.getSessionContext,
    getSessionFileMtime: store.getSessionFileMtime,
    deleteSession: store.deleteSession,
    createSession: async (input: CreateSessionInput) => {
      if (!hasCodexUserInput(input)) {
        throw new Error("codex create requires text or images");
      }
      const threadId = await createCodexThread({
        cwd: input.cwd,
        model: input.model ?? null,
        effort: input.effort ?? null,
      });
      const sendResult = await sendCodexMessage({
        threadId,
        text: input.text ?? "",
        images: input.images,
        cwd: input.cwd,
        model: input.model ?? null,
        effort: input.effort ?? null,
      });
      return {
        sessionId: threadId,
        turnId: sendResult.turnId,
      };
    },
    sendMessage: async (
      sessionId: string,
      input: SendMessageInput,
    ): Promise<SendMessageResult> => {
      const cwd = await store.getSessionCwd(sessionId);
      const result = await sendCodexMessage({
        threadId: sessionId,
        text: input.text,
        images: input.images,
        cwd,
        model: input.model ?? null,
        effort: input.effort ?? null,
      });
      return {
        turnId: result.turnId,
        outputText: null,
      };
    },
    supportsThreadState: true,
    supportsInterrupt: true,
    supportsUserInput: true,
    getThreadState: async (sessionId: string, requestedTurnId?: string | null) =>
      getCodexThreadState(sessionId, requestedTurnId),
    interruptSession: async (sessionId: string) => interruptCodexThread(sessionId),
    listUserInputRequests: async (sessionId: string) =>
      listCodexUserInputRequests(sessionId),
    submitUserInput: async (
      sessionId: string,
      requestId: string,
      response: ProviderUserInputResponsePayload,
    ) => submitCodexUserInput(sessionId, requestId, response),
  };
}
