import type {
  ProviderModelOption,
  SendMessageInput,
  SendMessageResult,
} from "../../types";
import { sendClaudeMessage } from "../transports/claude-cli";
import { createClaudeSessionStore } from "./claude-store";

export function createClaudeProvider(rootPath: string) {
  const store = createClaudeSessionStore(rootPath);

  return {
    id: "claude" as const,
    label: "Claude",
    description: "Anthropic Claude Code provider shell",
    rootPath,
    canCreateSession: false,
    supportsEmptyCreateSession: false,
    supportsModelSelection: false,
    readSessions: store.listSessions,
    readProjects: store.listProjects,
    listModels: async (): Promise<ProviderModelOption[]> => [],
    readConversationPage: store.getConversationPage,
    createSession: async () => {
      throw new Error("provider does not support creating sessions");
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
