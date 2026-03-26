export const SCROLL_THRESHOLD_PX = 96;

interface ScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

export function isNearConversationBottom(metrics: ScrollMetrics): boolean {
  const distanceFromBottom =
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom < SCROLL_THRESHOLD_PX;
}

export function createConversationTimelineResetToken(
  sessionId: string | null,
  summaryId: string | null,
): string {
  return `${sessionId ?? ""}:${summaryId ?? ""}`;
}
