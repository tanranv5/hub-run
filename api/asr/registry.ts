import type { AsrRegistry } from "./types";
import { createDoubaoAsrProvider } from "./providers/doubao/provider";

function isDoubaoAsrEnabled(): boolean {
  const value = process.env.HUB_RUN_ENABLE_DOUBAO_ASR?.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(value ?? "");
}

export function createAsrRegistry(): AsrRegistry {
  if (!isDoubaoAsrEnabled()) {
    return {};
  }

  return { doubao: createDoubaoAsrProvider() };
}
