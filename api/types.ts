export type ProviderId = "codex" | "claude";

export interface SessionRef {
  providerId: ProviderId;
  sessionId: string;
  projectPath: string;
}

export type ProviderErrorCode =
  | "CONFIG_MISSING"
  | "AUTH_REQUIRED"
  | "SESSION_NOT_FOUND"
  | "TRANSPORT_UNAVAILABLE"
  | "STREAM_BROKEN"
  | "UNSUPPORTED_CAPABILITY"
  | "PARSE_FAILED"
  | "INTERNAL_ERROR";

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
}

export interface ProviderCapabilities {
  history: boolean;
  send: boolean;
  stream: boolean;
  attach: boolean;
  createSession: boolean;
  emptyCreateSession: boolean;
  modelSelection: boolean;
  threadState: boolean;
  interrupt: boolean;
  userInput: boolean;
  deleteSession: boolean;
}

export interface ProviderStatus {
  historyReadable: boolean;
  sendAvailable: boolean;
  configResolved: boolean;
  lastError: ProviderError | null;
}

export interface ProviderSummary {
  id: ProviderId;
  label: string;
  description: string;
  rootPath: string;
  capabilities: ProviderCapabilities;
  status: ProviderStatus;
}

export interface SessionSummary {
  id: string;
  isDraft?: boolean;
  sessionKey?: string;
  display: string;
  timestamp: number;
  project: string;
  projectName: string;
}

export type ProviderReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface ProviderModelOption {
  id: string;
  displayName: string;
  description: string;
  isDefault: boolean;
  hidden: boolean;
  defaultReasoningEffort: ProviderReasoningEffort | null;
  supportedReasoningEfforts: ProviderReasoningEffort[];
}

export type ConversationRole = "user" | "assistant" | "system";

export type ConversationKind =
  | "text"
  | "image"
  | "thinking"
  | "tool_use"
  | "tool_result"
  | "summary"
  | "turn_aborted";

export type ConversationBlockType = ConversationKind;

export interface ConversationBlock {
  type: ConversationBlockType;
  text?: string;
  imageUrl?: string;
  imagePath?: string;
  thinking?: string;
  title?: string;
  id?: string;
  name?: string;
  input?: unknown;
  toolUseId?: string;
  content?: unknown;
  isError?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  kind: ConversationKind;
  text: string;
  title?: string;
  timestamp?: string;
  block?: ConversationBlock;
  anchor?: ConversationAnchor;
}

export interface ConversationPage {
  messages: ConversationMessage[];
  nextBefore: string | null;
  summary: ConversationMessage | null;
}

export type ConversationSearchScope = "current" | "all";

export type ConversationSearchMode = "all" | "compact" | "text";

export interface ConversationAnchor {
  offset: number;
  blockIndex: number;
}

export interface ConversationSearchRange {
  start: number;
  end: number;
}

export interface ConversationSearchHit {
  messageId: string;
  messageIndex: number;
  role: ConversationRole;
  kind: ConversationKind;
  timestamp?: string;
  preview: string;
  ranges: ConversationSearchRange[];
  anchor: ConversationAnchor;
}

export interface ConversationSearchResult {
  query: string;
  mode: ConversationSearchMode;
  totalMessages: number;
  totalHits: number;
  hits: ConversationSearchHit[];
}

export interface ConversationSearchPageResult {
  query: string;
  mode: ConversationSearchMode;
  totalHits: number;
  hits: ConversationSearchHit[];
  nextAnchor: ConversationAnchor | null;
}

export interface ConversationLocateResult {
  hitMessageId: string;
  messages: ConversationMessage[];
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface ConversationContextResult extends ConversationLocateResult {
  anchor: ConversationAnchor;
}

export interface SessionsPage {
  sessions: SessionSummary[];
  nextBefore: string | null;
  totalCount?: number;
}

export interface ProviderSessionsStreamUpdate {
  upserts: SessionSummary[];
  removedIds: string[];
  nextBefore: string | null;
  totalCount?: number;
}

export interface SendMessageResult {
  turnId: string | null;
  outputText: string | null;
}

export interface ProviderConversationStreamChunk {
  messages: ConversationMessage[];
  nextOffset: number;
}

export interface ProviderConversationStreamSnapshot extends ConversationPage {
  nextOffset: number;
}

export type ProviderTurnStatus =
  | "inProgress"
  | "completed"
  | "failed"
  | "interrupted";

export type ProviderThreadDesyncReason =
  | "messageTailAheadOfThreadSnapshot"
  | "recentMessagesWithNoSnapshot"
  | "activeFileWriteWithInterruptedTurn";

export type ProviderThreadStallReason =
  | "noRecentActivity";

export interface ProviderThreadState {
  threadId: string;
  activeTurnId: string | null;
  isGenerating: boolean;
  requestedTurnId: string | null;
  requestedTurnStatus: ProviderTurnStatus | null;
  rawRequestedTurnStatus?: ProviderTurnStatus | null;
  desynced?: boolean;
  desyncReason?: ProviderThreadDesyncReason | null;
  stalled?: boolean;
  stallReason?: ProviderThreadStallReason | null;
  snapshotAt?: string | null;
  latestMessageAt?: string | null;
  lastActivityAt?: string | null;
}

export interface ProviderSessionContext {
  sessionId: string;
  modelId: string | null;
  reasoningEffort: ProviderReasoningEffort | null;
  usedTokens: number | null;
  modelContextWindow: number | null;
  contextLeftPercent: number | null;
}

export interface ProviderUserInputQuestionOption {
  label: string;
  description: string;
}

export interface ProviderUserInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: ProviderUserInputQuestionOption[];
}

export interface ProviderUserInputRequest {
  requestId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  questions: ProviderUserInputQuestion[];
}

export interface ProviderRuntimeStateSnapshot {
  threadState: ProviderThreadState | null;
  pendingUserInputRequests: ProviderUserInputRequest[];
}

export interface ProviderUserInputResponsePayload {
  answers: Record<string, { answers: string[] }>;
}

export interface CreateSessionInput {
  cwd: string;
  text?: string;
  model?: string | null;
  effort?: ProviderReasoningEffort | null;
}

export interface CreateSessionResult {
  sessionId: string;
  turnId: string | null;
  outputText?: string | null;
}

export interface SendMessageInput {
  text: string;
  cwd?: string;
  model?: string | null;
  effort?: ProviderReasoningEffort | null;
}

export interface ProviderAdapter {
  summary: ProviderSummary;
  getSummary?(): ProviderSummary;
  listSessions(): Promise<SessionSummary[]>;
  listProjects(): Promise<string[]>;
  listModels(): Promise<ProviderModelOption[]>;
  getConversationPage(
    sessionId: string,
    before: string | null,
    limit: number,
  ): Promise<ConversationPage>;
  searchConversation?(
    sessionId: string,
    query: string,
    mode: ConversationSearchMode,
    recentLimit?: number | null,
  ): Promise<ConversationSearchResult>;
  searchConversationPage?(
    sessionId: string,
    query: string,
    mode: ConversationSearchMode,
    anchor: ConversationAnchor | null,
    limit: number,
    recentLimit?: number | null,
  ): Promise<ConversationSearchPageResult>;
  locateConversation?(
    sessionId: string,
    messageId: string,
    mode: ConversationSearchMode,
    window: number,
  ): Promise<ConversationLocateResult | null>;
  readConversationContext?(
    sessionId: string,
    anchor: ConversationAnchor,
    mode: ConversationSearchMode,
    window: number,
  ): Promise<ConversationContextResult | null>;
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  sendMessage(sessionId: string, input: SendMessageInput): Promise<SendMessageResult>;
  getThreadState?(
    sessionId: string,
    requestedTurnId?: string | null,
  ): Promise<ProviderThreadState>;
  getSessionContext?(sessionId: string): Promise<ProviderSessionContext>;
  getSessionFileMtime?(sessionId: string): Promise<number | null>;
  deleteSession?(sessionId: string): Promise<void>;
  interruptSession?(sessionId: string): Promise<void>;
  listUserInputRequests?(sessionId: string): Promise<ProviderUserInputRequest[]>;
  submitUserInput?(
    sessionId: string,
    requestId: string,
    response: ProviderUserInputResponsePayload,
  ): Promise<void>;
  subscribeSessions?(onChange: () => void): () => void;
  subscribeConversation?(sessionId: string, onChange: () => void): () => void;
  getConversationStream?(
    sessionId: string,
    offset: number,
  ): Promise<ProviderConversationStreamChunk>;
  getConversationStreamCursor?(sessionId: string): Promise<number>;
}
