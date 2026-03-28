import type { ProviderId, SessionSummary } from "../api/types";

const MAX_SESSION_TITLE_LENGTH = 30;
export const SESSION_LIST_ITEM_HEIGHT = 76;
export const SESSION_LIST_OVERSCAN = 3;
export const SESSION_LIST_DEFAULT_VIEWPORT_HEIGHT = 480;

interface VirtualWindowInput {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  scrollTop: number;
}

interface RevealIndexInput {
  currentScrollTop: number;
  containerHeight: number;
  itemHeight: number;
  index: number;
}

export interface VirtualWindowRange {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
}

export function getProjectLabel(projectPath: string): string {
  return projectPath || "(empty project)";
}

export function getSessionTitle(display: string): string {
  const normalized = display.replace(/\s+/g, " ").trim();
  if (!normalized || isPlaceholderSessionTitle(normalized)) {
    return "未命名会话";
  }
  if (normalized.length <= MAX_SESSION_TITLE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_SESSION_TITLE_LENGTH)}...`;
}

function isPlaceholderSessionTitle(display: string): boolean {
  return (
    display === "(no prompt text)" ||
    display === "(empty)" ||
    /^<image name=\[[^\]]+\]>$/i.test(display) ||
    /^<\/image>$/i.test(display)
  );
}

export function buildResumeCommand(
  providerId: ProviderId,
  sessionId: string,
  projectPath: string,
): string {
  const command = providerId === "claude"
    ? `claude --resume ${sessionId}`
    : `codex resume ${sessionId}`;
  return `cd ${projectPath} && ${command}`;
}

export function resolveSelectedProject(
  projects: string[],
  value: string,
): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return projects.includes(normalized) ? normalized : null;
}

export function matchesSessionFilter(
  session: SessionSummary,
  selectedProject: string | null,
  search: string,
): boolean {
  const query = search.trim().toLowerCase();
  const matchesProject = !selectedProject || session.project === selectedProject;
  const matchesSearch =
    !query ||
    session.display.toLowerCase().includes(query) ||
    session.projectName.toLowerCase().includes(query) ||
    session.project.toLowerCase().includes(query);

  return matchesProject && matchesSearch;
}

export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindowRange {
  const {
    itemCount,
    itemHeight,
    containerHeight,
    overscan,
    scrollTop,
  } = input;
  if (itemCount <= 0 || itemHeight <= 0 || containerHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: itemCount,
      paddingTop: 0,
      paddingBottom: 0,
    };
  }

  const visibleStart = Math.max(0, Math.floor(scrollTop / itemHeight));
  const visibleCount = Math.max(1, Math.ceil(containerHeight / itemHeight));
  const startIndex = Math.max(0, visibleStart - overscan);
  const endIndex = Math.min(itemCount, visibleStart + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    paddingTop: startIndex * itemHeight,
    paddingBottom: Math.max(0, (itemCount - endIndex) * itemHeight),
  };
}

export function getScrollTopToRevealIndex(input: RevealIndexInput): number {
  const {
    currentScrollTop,
    containerHeight,
    itemHeight,
    index,
  } = input;
  const itemTop = index * itemHeight;
  const itemBottom = itemTop + itemHeight;
  const viewportTop = currentScrollTop;
  const viewportBottom = currentScrollTop + containerHeight;

  if (itemTop >= viewportTop && itemBottom <= viewportBottom) {
    return currentScrollTop;
  }
  if (itemTop < viewportTop) {
    return itemTop;
  }
  return Math.max(0, itemBottom - containerHeight);
}
