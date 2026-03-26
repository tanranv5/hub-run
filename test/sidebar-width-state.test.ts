import assert from "node:assert/strict";
import test from "node:test";
import {
  clampDesktopSidebarWidth,
  DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  DESKTOP_SIDEBAR_MAX_WIDTH,
  DESKTOP_SIDEBAR_MIN_WIDTH,
  DESKTOP_SIDEBAR_STORAGE_KEY,
  readDesktopSidebarWidth,
  writeDesktopSidebarWidth,
} from "../web/sidebar-width-state";

function createStorage(initialValue?: string) {
  const map = new Map<string, string>();
  if (initialValue !== undefined) {
    map.set(DESKTOP_SIDEBAR_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("sidebar width clamps into desktop bounds", () => {
  assert.equal(clampDesktopSidebarWidth(120), DESKTOP_SIDEBAR_MIN_WIDTH);
  assert.equal(clampDesktopSidebarWidth(700), DESKTOP_SIDEBAR_MAX_WIDTH);
  assert.equal(clampDesktopSidebarWidth(319.6), DESKTOP_SIDEBAR_DEFAULT_WIDTH);
});

test("sidebar width reader falls back to default for missing or invalid values", () => {
  assert.equal(readDesktopSidebarWidth(null), DESKTOP_SIDEBAR_DEFAULT_WIDTH);
  assert.equal(
    readDesktopSidebarWidth(createStorage("not-a-number")),
    DESKTOP_SIDEBAR_DEFAULT_WIDTH,
  );
});

test("sidebar width writer persists normalized width to storage", () => {
  const storage = createStorage();

  writeDesktopSidebarWidth(storage, 514.6);

  assert.equal(
    storage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY),
    String(515),
  );
  assert.equal(readDesktopSidebarWidth(storage), 515);
});
