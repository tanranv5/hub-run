import type { SessionSummary } from "../api/types";

const DRAFT_PREFIX = "draft:";

export function createDraftSession(
  cwd: string,
  timestamp = Date.now(),
): SessionSummary {
  return {
    id: `${DRAFT_PREFIX}${timestamp}`,
    isDraft: true,
    display: "新会话",
    timestamp,
    project: cwd,
    projectName: getProjectName(cwd),
  };
}

export function insertDraftSession(
  sessions: SessionSummary[],
  draft: SessionSummary,
): SessionSummary[] {
  return [draft, ...sessions.filter((session) => !isDraftSession(session))];
}

export function isDraftSession(
  session: SessionSummary | null | undefined,
): boolean {
  return Boolean(session) && (session?.isDraft === true || session.id.startsWith(DRAFT_PREFIX));
}

function getProjectName(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}
