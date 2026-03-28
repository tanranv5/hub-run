import type {
  ProviderThreadState,
  ProviderTurnStatus,
  ProviderUserInputQuestion,
  ProviderUserInputQuestionOption,
  ProviderUserInputResponsePayload,
} from "../../types";

export function parseRequestUserInputParams(
  value: unknown,
): {
  threadId: string;
  turnId: string;
  itemId: string;
  questions: ProviderUserInputQuestion[];
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const threadId = asString(record.threadId)?.trim() ?? "";
  const turnId = asString(record.turnId)?.trim() ?? "";
  const itemId = asString(record.itemId)?.trim() ?? "";
  if (!threadId || !turnId || !itemId || !Array.isArray(record.questions)) {
    return null;
  }

  const questions = record.questions
    .map((questionValue) => parseQuestion(questionValue))
    .filter((question): question is ProviderUserInputQuestion => !!question);
  if (questions.length === 0) {
    return null;
  }

  return {
    threadId,
    turnId,
    itemId,
    questions,
  };
}

export function validateUserInputResponsePayload(
  value: unknown,
): asserts value is ProviderUserInputResponsePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("response must be an object");
  }

  const record = value as Record<string, unknown>;
  if (!record.answers || typeof record.answers !== "object" || Array.isArray(record.answers)) {
    throw new Error("response.answers must be an object");
  }

  for (const [questionId, answerValue] of Object.entries(record.answers)) {
    if (!questionId.trim()) {
      throw new Error("response.answers has an empty question id");
    }
    if (!answerValue || typeof answerValue !== "object" || Array.isArray(answerValue)) {
      throw new Error(`response.answers.${questionId} must be an object`);
    }

    const answerRecord = answerValue as Record<string, unknown>;
    if (!Array.isArray(answerRecord.answers)) {
      throw new Error(`response.answers.${questionId}.answers must be an array`);
    }
    for (const answer of answerRecord.answers) {
      if (typeof answer !== "string") {
        throw new Error(
          `response.answers.${questionId}.answers entries must be strings`,
        );
      }
    }
  }
}

export function buildThreadState(
  threadId: string,
  result: unknown,
  requestedTurnId?: string | null,
): ProviderThreadState {
  const turns = extractTurnsFromThreadReadResult(result);
  let activeTurnId: string | null = null;
  let latestTurnId: string | null = null;
  let latestTurnStatus: ProviderTurnStatus | null = null;
  const normalizedRequestedTurnId =
    typeof requestedTurnId === "string" && requestedTurnId.trim()
      ? requestedTurnId.trim()
      : null;
  let requestedTurnStatus: ProviderTurnStatus | null = null;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || typeof turn !== "object") {
      continue;
    }

    const turnId = asString((turn as { id?: unknown }).id)?.trim() ?? "";
    const turnStatus = toTurnStatus((turn as { status?: unknown }).status);
    if (!latestTurnId && turnId && turnStatus) {
      latestTurnId = turnId;
      latestTurnStatus = turnStatus;
    }
    if (normalizedRequestedTurnId && turnId === normalizedRequestedTurnId && turnStatus) {
      requestedTurnStatus = turnStatus;
    }
    if (!activeTurnId && turnId && turnStatus === "inProgress") {
      activeTurnId = turnId;
    }
  }

  const resolvedRequestedTurn = resolveRequestedTurnSnapshot({
    activeTurnId,
    latestTurnId,
    latestTurnStatus,
    requestedTurnId: normalizedRequestedTurnId,
    requestedTurnStatus,
  });
  const snapshotAt = extractThreadUpdatedAt(result);

  return {
    threadId,
    activeTurnId,
    isGenerating: activeTurnId !== null,
    requestedTurnId: resolvedRequestedTurn.turnId,
    requestedTurnStatus: resolvedRequestedTurn.turnStatus,
    ...(snapshotAt ? { snapshotAt } : {}),
  };
}

function resolveRequestedTurnSnapshot(props: {
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnStatus: ProviderTurnStatus | null;
  requestedTurnId: string | null;
  requestedTurnStatus: ProviderTurnStatus | null;
}) {
  const {
    activeTurnId,
    latestTurnId,
    latestTurnStatus,
    requestedTurnId,
    requestedTurnStatus,
  } = props;
  // If there is an active (in-progress) turn, always report it as the current focus —
  // even if the frontend is tracking a stale requestedTurnId from a previous send.
  if (activeTurnId) {
    if (requestedTurnId && requestedTurnId === activeTurnId) {
      return { turnId: requestedTurnId, turnStatus: requestedTurnStatus };
    }
    return {
      turnId: activeTurnId,
      turnStatus: "inProgress" as const,
    };
  }
  if (requestedTurnId) {
    // 若请求的 turn 已中断，且存在更新的 turn，切换至最新 turn
    if (
      requestedTurnStatus === "interrupted" &&
      latestTurnId &&
      latestTurnId !== requestedTurnId
    ) {
      return { turnId: latestTurnId, turnStatus: latestTurnStatus };
    }
    return {
      turnId: requestedTurnId,
      turnStatus: requestedTurnStatus,
    };
  }
  return {
    turnId: latestTurnId,
    turnStatus: latestTurnStatus,
  };
}

function parseQuestion(value: unknown): ProviderUserInputQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const question = value as Record<string, unknown>;
  const id = asString(question.id)?.trim() ?? "";
  const prompt = asString(question.question)?.trim() ?? "";
  if (!id || !prompt) {
    return null;
  }

  return {
    id,
    header: asString(question.header)?.trim() || "Question",
    question: prompt,
    isOther: question.isOther === true,
    isSecret: question.isSecret === true,
    options: Array.isArray(question.options)
      ? question.options
          .map((option) => parseQuestionOption(option))
          .filter((option): option is ProviderUserInputQuestionOption => !!option)
      : [],
  };
}

function parseQuestionOption(value: unknown): ProviderUserInputQuestionOption | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const option = value as Record<string, unknown>;
  const label = asString(option.label)?.trim() ?? "";
  if (!label) {
    return null;
  }

  return {
    label,
    description: asString(option.description) ?? "",
  };
}

function extractTurnsFromThreadReadResult(result: unknown): unknown[] {
  if (!result || typeof result !== "object") {
    return [];
  }

  const topLevelTurns = (result as { turns?: unknown }).turns;
  if (Array.isArray(topLevelTurns)) {
    return topLevelTurns;
  }

  const thread = (result as { thread?: unknown }).thread;
  if (!thread || typeof thread !== "object") {
    return [];
  }

  const nestedTurns = (thread as { turns?: unknown }).turns;
  return Array.isArray(nestedTurns) ? nestedTurns : [];
}

function extractThreadUpdatedAt(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const topLevelUpdatedAt = normalizeTimestamp(
    (result as { updatedAt?: unknown }).updatedAt,
  );
  if (topLevelUpdatedAt) {
    return topLevelUpdatedAt;
  }

  const thread = (result as { thread?: unknown }).thread;
  if (!thread || typeof thread !== "object") {
    return null;
  }

  return normalizeTimestamp((thread as { updatedAt?: unknown }).updatedAt);
}

function toTurnStatus(value: unknown): ProviderTurnStatus | null {
  if (value === "inProgress" || value === "completed" || value === "failed" || value === "interrupted") {
    return value;
  }
  if (value === "in_progress" || value === "streaming" || value === "queued" || value === "running") {
    return "inProgress";
  }
  if (value === "cancelling") {
    return "inProgress";
  }
  if (typeof value === "string" && value.trim()) {
    return "inProgress";
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value >= 1_000_000_000_000 ? value : value * 1_000;
    return toIsoTimestamp(millis);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const millis = numeric >= 1_000_000_000_000 ? numeric : numeric * 1_000;
      return toIsoTimestamp(millis);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return toIsoTimestamp(parsed);
    }
  }
  return null;
}

function toIsoTimestamp(value: number): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}
