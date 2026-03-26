export function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMinutes < 1) {
    return "刚刚";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }
  if (diffDays < 7) {
    return `${diffDays} 天前`;
  }

  return date.toLocaleDateString("zh-CN");
}

const BEIJING_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatConversationTimestamp(timestamp?: string): string | null {
  const value = timestamp?.trim();
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return BEIJING_TIME_FORMATTER.format(parsed);
}
