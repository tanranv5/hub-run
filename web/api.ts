import type {
  ConversationAnchor,
  ConversationContextResult,
  ConversationPage,
  ConversationLocateResult,
  ConversationSearchPageResult,
  ConversationSearchResult,
  ConversationSearchMode,
  CreateSessionResult,
  ProviderModelOption,
  ProviderId,
  ProviderSessionContext,
  ProviderThreadState,
  ProviderUserInputRequest,
  ProviderUserInputResponsePayload,
  SendMessageInput,
  ProviderSummary,
  SendMessageResult,
  SessionsPage,
} from "../api/types";

export interface AuthStatus {
  authEnabled: boolean;
  authenticated: boolean;
}

interface ProvidersPayload {
  providers: ProviderSummary[];
}

interface ProjectsPayload {
  projects: string[];
}

interface ModelsPayload {
  models: ProviderModelOption[];
}

import { notifyAuthLost } from "./realtime-auth";

export class AuthLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthLostError";
  }
}

export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      notifyAuthLost();
      throw new AuthLostError("Login required");
    }
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(payload?.error?.message ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await fetch("/api/auth/status", {
    credentials: "include",
  });
  return readJson<AuthStatus>(response);
}

export async function loginWithPassword(password: string): Promise<void> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  await readJson<{ ok: boolean }>(response);
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  await readJson<{ ok: boolean }>(response);
}

export async function getProviders(): Promise<ProviderSummary[]> {
  const response = await fetch("/api/providers", {
    credentials: "include",
  });
  const payload = await readJson<ProvidersPayload>(response);
  return payload.providers;
}

export async function getProviderSessions(
  providerId: ProviderId,
  before: string | null,
  limit: number,
  project: string | null = null,
): Promise<SessionsPage> {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  if (before) {
    search.set("before", before);
  }
  if (project) {
    search.set("project", project);
  }

  const response = await fetch(
    `/api/providers/${providerId}/sessions?${search.toString()}`,
    {
      credentials: "include",
    },
  );
  return readJson<SessionsPage>(response);
}

export async function getProviderProjects(
  providerId: ProviderId,
): Promise<string[]> {
  const response = await fetch(`/api/providers/${providerId}/projects`, {
    credentials: "include",
  });
  const payload = await readJson<ProjectsPayload>(response);
  return payload.projects;
}

export async function getProviderModels(
  providerId: ProviderId,
): Promise<ProviderModelOption[]> {
  const response = await fetch(`/api/providers/${providerId}/models`, {
    credentials: "include",
  });
  const payload = await readJson<ModelsPayload>(response);
  return payload.models;
}

export async function createProviderSession(
  providerId: ProviderId,
  input: {
    cwd: string;
    text?: string;
    model?: string | null;
    effort?: SendMessageInput["effort"];
  },
): Promise<CreateSessionResult> {
  const response = await fetch(`/api/providers/${providerId}/sessions`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await readJson<{
    ok: boolean;
    sessionId: string;
    turnId: string | null;
    outputText?: string | null;
  }>(response);
  return {
    sessionId: payload.sessionId,
    turnId: payload.turnId,
    outputText: payload.outputText ?? null,
  };
}

export async function getConversationPage(
  providerId: ProviderId,
  sessionId: string,
  before: string | null,
  limit: number,
): Promise<ConversationPage> {
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  if (before) {
    search.set("before", before);
  }

  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/messages?${search.toString()}`,
    {
      credentials: "include",
    },
  );
  return readJson<ConversationPage>(response);
}

export async function searchConversationMessages(
  providerId: ProviderId,
  sessionId: string,
  query: string,
  mode: ConversationSearchMode,
): Promise<ConversationSearchResult> {
  const search = new URLSearchParams();
  search.set("q", query);
  search.set("mode", mode);
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/messages/search?${search.toString()}`,
    {
      credentials: "include",
    },
  );
  return readJson<ConversationSearchResult>(response);
}

export async function locateConversationMessage(
  providerId: ProviderId,
  sessionId: string,
  messageId: string,
  mode: ConversationSearchMode,
  window: number,
): Promise<ConversationLocateResult | null> {
  const search = new URLSearchParams();
  search.set("messageId", messageId);
  search.set("mode", mode);
  search.set("window", String(window));
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/messages/locate?${search.toString()}`,
    {
      credentials: "include",
    },
  );
  return readJson<ConversationLocateResult | null>(response);
}

export async function searchConversationMessagePage(
  providerId: ProviderId,
  sessionId: string,
  query: string,
  mode: ConversationSearchMode,
  anchor: ConversationAnchor | null,
  limit: number,
  recentLimit?: number | null,
): Promise<ConversationSearchPageResult> {
  const search = new URLSearchParams();
  search.set("q", query);
  search.set("mode", mode);
  search.set("limit", String(limit));
  if (typeof recentLimit === "number" && Number.isFinite(recentLimit)) {
    search.set("recentLimit", String(recentLimit));
  }
  if (anchor) {
    search.set("afterOffset", String(anchor.offset));
    search.set("afterBlockIndex", String(anchor.blockIndex));
  }
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/messages/search-page?${search.toString()}`,
    {
      credentials: "include",
    },
  );
  return readJson<ConversationSearchPageResult>(response);
}

export async function readConversationMessageContext(
  providerId: ProviderId,
  sessionId: string,
  anchor: ConversationAnchor,
  mode: ConversationSearchMode,
  window: number,
): Promise<ConversationContextResult | null> {
  const search = new URLSearchParams();
  search.set("offset", String(anchor.offset));
  search.set("blockIndex", String(anchor.blockIndex));
  search.set("mode", mode);
  search.set("window", String(window));
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/messages/context?${search.toString()}`,
    {
      credentials: "include",
    },
  );
  return readJson<ConversationContextResult | null>(response);
}

export async function sendConversationMessage(
  providerId: ProviderId,
  sessionId: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/messages`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  return readJson<SendMessageResult>(response);
}

export async function getProviderThreadState(
  providerId: ProviderId,
  sessionId: string,
  turnId: string | null,
): Promise<ProviderThreadState> {
  const search = new URLSearchParams();
  if (turnId?.trim()) {
    search.set("turnId", turnId.trim());
  }

  const query = search.toString();
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/state${query ? `?${query}` : ""}`,
    {
      credentials: "include",
    },
  );
  return readJson<ProviderThreadState>(response);
}

export async function getProviderSessionContext(
  providerId: ProviderId,
  sessionId: string,
): Promise<ProviderSessionContext> {
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/context`,
    {
      credentials: "include",
    },
  );
  return readJson<ProviderSessionContext>(response);
}

export async function deleteProviderSession(
  providerId: ProviderId,
  sessionId: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  return readJson<{ ok: boolean }>(response);
}

export async function interruptProviderSession(
  providerId: ProviderId,
  sessionId: string,
): Promise<{ ok: boolean }> {
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/interrupt`,
    {
      method: "POST",
      credentials: "include",
    },
  );
  return readJson<{ ok: boolean }>(response);
}

export async function listProviderUserInputRequests(
  providerId: ProviderId,
  sessionId: string,
): Promise<ProviderUserInputRequest[]> {
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/requests/user-input`,
    {
      credentials: "include",
    },
  );
  const payload = await readJson<{ requests: ProviderUserInputRequest[] }>(response);
  return Array.isArray(payload.requests) ? payload.requests : [];
}

export async function respondProviderUserInputRequest(
  providerId: ProviderId,
  sessionId: string,
  requestId: string,
  responsePayload: ProviderUserInputResponsePayload,
): Promise<{ ok: boolean }> {
  const response = await fetch(
    `/api/providers/${providerId}/sessions/${sessionId}/requests/user-input/${requestId}/respond`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(responsePayload),
    },
  );
  return readJson<{ ok: boolean }>(response);
}
