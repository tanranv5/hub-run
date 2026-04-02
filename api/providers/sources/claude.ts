import type {
  CreateSessionInput,
  ProviderModelOption,
  SendMessageInput,
  SendMessageResult,
} from "../../types";
import { createClaudeSession, sendClaudeMessage } from "../transports/claude-cli";
import { createClaudeSessionStore } from "./claude-store";

export function createClaudeProvider(rootPath: string) {
  const store = createClaudeSessionStore(rootPath);

  return {
    id: "claude" as const,
    label: "Claude",
    description: "Anthropic Claude Code provider shell",
    rootPath,
    canCreateSession: true,
    supportsEmptyCreateSession: false,
    supportsModelSelection: false,
    readSessions: store.listSessions,
    readProjects: store.listProjects,
    listModels: async (): Promise<ProviderModelOption[]> => [],
    readConversationPage: store.getConversationPage,
    searchConversation: store.searchConversation,
    searchConversationPage: store.searchConversationPage,
    locateConversation: store.locateConversation,
    readConversationContext: store.readConversationContext,
    deleteSession: store.deleteSession,
    createSession: async (input: CreateSessionInput) => {
      const result = await createClaudeSession({
        text: input.text?.trim() ?? "",
        cwd: input.cwd,
      });
      return {
        sessionId: result.sessionId,
        turnId: null,
        outputText: result.outputText,
      };
    },
    sendMessage: async (
      sessionId: string,
      input: SendMessageInput,
    ): Promise<SendMessageResult> => {
      const projectPath = await store.getSessionProjectPath(sessionId);
      if (!projectPath) {
        throw new Error("session project path is missing");
      }

      const result = await sendClaudeMessage({
        sessionId,
        text: input.text,
        cwd: projectPath,
      });

      return {
        turnId: null,
        outputText: result.outputText,
      };
    },
  };
}
