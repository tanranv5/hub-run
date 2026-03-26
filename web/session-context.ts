import { useEffect, useState } from "react";
import type { ProviderId, ProviderSessionContext } from "../api/types";
import { getProviderSessionContext } from "./api";

export function useProviderSessionContext(props: {
  providerId: ProviderId | null;
  refreshVersion: number;
  sessionId: string | null;
  sessionTimestamp: number | null;
}) {
  const { providerId, refreshVersion, sessionId, sessionTimestamp } = props;
  const [context, setContext] = useState<ProviderSessionContext | null>(null);

  useEffect(() => {
    if (!providerId || !sessionId) {
      setContext(null);
      return;
    }

    let cancelled = false;
    getProviderSessionContext(providerId, sessionId)
      .then((nextContext) => {
        if (!cancelled) {
          setContext(nextContext);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContext(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [providerId, refreshVersion, sessionId, sessionTimestamp]);

  return context;
}

export function formatContextLabel(context: ProviderSessionContext | null) {
  const usage = resolveContextUsage(context);
  if (usage.usedPercent !== null) {
    return `${usage.usedPercent}%`;
  }
  return null;
}

export function formatContextDetails(context: ProviderSessionContext | null) {
  const usage = resolveContextUsage(context);
  if (usage.usedTokens !== null && usage.windowTokens !== null) {
    return `${usage.usedTokens}/${usage.windowTokens}`;
  }
  return null;
}

function resolveContextUsage(context: ProviderSessionContext | null) {
  const windowTokens = normalizeTokenCount(context?.modelContextWindow ?? null);
  let usedTokens = normalizeTokenCount(context?.usedTokens ?? null);

  if (usedTokens === null && windowTokens !== null) {
    const leftPercent = normalizePercent(context?.contextLeftPercent ?? null);
    if (leftPercent !== null) {
      usedTokens = Math.round(windowTokens * ((100 - leftPercent) / 100));
    }
  }

  let usedPercent: number | null = null;
  if (usedTokens !== null && windowTokens !== null && windowTokens > 0) {
    usedPercent = clampPercent(Math.floor((usedTokens / windowTokens) * 100));
  } else {
    const leftPercent = normalizePercent(context?.contextLeftPercent ?? null);
    if (leftPercent !== null) {
      usedPercent = clampPercent(100 - Math.round(leftPercent));
    }
  }

  return {
    usedTokens,
    usedPercent,
    windowTokens,
  };
}

function normalizeTokenCount(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

function normalizePercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return clampPercent(value);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}
