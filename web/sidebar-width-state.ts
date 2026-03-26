export const DESKTOP_SIDEBAR_DEFAULT_WIDTH = 320;
export const DESKTOP_SIDEBAR_MIN_WIDTH = 260;
export const DESKTOP_SIDEBAR_MAX_WIDTH = 520;
export const DESKTOP_SIDEBAR_STORAGE_KEY = "hub-run.desktopSidebarWidth";

type StorageReader = Pick<Storage, "getItem"> | null | undefined;
type StorageWriter = Pick<Storage, "setItem"> | null | undefined;

export function clampDesktopSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DESKTOP_SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.min(
    DESKTOP_SIDEBAR_MAX_WIDTH,
    Math.max(DESKTOP_SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

export function readDesktopSidebarWidth(storage: StorageReader): number {
  if (!storage) {
    return DESKTOP_SIDEBAR_DEFAULT_WIDTH;
  }

  const raw = storage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
  if (!raw) {
    return DESKTOP_SIDEBAR_DEFAULT_WIDTH;
  }

  return clampDesktopSidebarWidth(Number.parseInt(raw, 10));
}

export function writeDesktopSidebarWidth(
  storage: StorageWriter,
  width: number,
): void {
  if (!storage) {
    return;
  }

  storage.setItem(
    DESKTOP_SIDEBAR_STORAGE_KEY,
    String(clampDesktopSidebarWidth(width)),
  );
}
