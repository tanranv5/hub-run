import { Hono } from "hono";
import { rejectInvalidWriteOrigin } from "../auth";
import type { RuntimeConfig } from "../config";
import { paginateSessions } from "../providers/shared";
import type {
  ConversationAnchor,
  ConversationSearchMode,
  CreateSessionResult,
  ProviderAdapter,
  ProviderId,
  ProviderReasoningEffort,
} from "../types";
import { getProviderSummary, listProviderSummaries } from "../providers/registry";
import { resolveProviderRouteError } from "./provider-route-errors";
import { registerProviderStateRoutes } from "./provider-state";
import { registerProviderStreamRoutes } from "./provider-stream";

export function findAdapter(
  registry: Record<ProviderId, ProviderAdapter>,
  providerId: string,
): ProviderAdapter | null {
  return registry[providerId as ProviderId] ?? null;
}

function parseLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "50", 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.min(100, Math.max(1, parsed));
}

function parseSearchMode(
  value: string | undefined,
): ConversationSearchMode | undefined {
  if (!value || value === "all") {
    return "all";
  }
  if (value === "compact" || value === "text") {
    return value;
  }
  return undefined;
}

function parseLocateWindow(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "20", 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(100, Math.max(1, parsed));
}

function parseSearchPageLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "20", 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(100, Math.max(1, parsed));
}

function parseRecentLimit(value: string | undefined): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(100, Math.max(1, parsed));
}

function parseConversationAnchor(
  offsetValue: string | undefined,
  blockIndexValue: string | undefined,
): ConversationAnchor | null {
  const offset = Number.parseInt(offsetValue ?? "", 10);
  const blockIndex = Number.parseInt(blockIndexValue ?? "0", 10);
  if (!Number.isFinite(offset) || offset < 0) {
    return null;
  }
  if (!Number.isFinite(blockIndex) || blockIndex < 0) {
    return null;
  }
  return {
    offset,
    blockIndex,
  };
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return undefined;
}

function filterSessionsByProject(
  sessions: Awaited<ReturnType<ProviderAdapter["listSessions"]>>,
  project: string | undefined,
) {
  const normalized = project?.trim();
  if (!normalized) {
    return sessions;
  }
  return sessions.filter((session) => session.project === normalized);
}

function parseOptionalEffort(
  value: unknown,
): ProviderReasoningEffort | null | undefined {
  if (value === null) {
    return null;
  }

  if (value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }

  return undefined;
}

function buildCreateSessionPayload(result: CreateSessionResult) {
  return {
    ok: true,
    sessionId: result.sessionId,
    turnId: result.turnId,
    ...("outputText" in result
      ? { outputText: result.outputText ?? null }
      : {}),
  };
}

export function createProvidersRouter(
  registry: Record<ProviderId, ProviderAdapter>,
  config: RuntimeConfig,
) {
  const router = new Hono();

  router.get("/", (c) => c.json({ providers: listProviderSummaries(registry) }));

  router.get("/:providerId/status", (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    return c.json({ provider: getProviderSummary(adapter) });
  });

  router.get("/:providerId/sessions", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }

    const page = paginateSessions(
      filterSessionsByProject(
        await adapter.listSessions(),
        c.req.query("project"),
      ),
      c.req.query("before") ?? null,
      parseLimit(c.req.query("limit")),
    );
    return c.json(page);
  });

  router.get("/:providerId/projects", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    return c.json({ projects: await adapter.listProjects() });
  });

  router.get("/:providerId/models", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }

    return c.json({ models: await adapter.listModels() });
  });

  router.post("/:providerId/sessions", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    const summary = getProviderSummary(adapter);

    if (!summary.capabilities.createSession) {
      return c.json(
        { error: { code: "UNSUPPORTED_CAPABILITY", message: "Provider does not support creating sessions" } },
        400,
      );
    }

    const body = (await c.req.json().catch(() => null)) as
      | { cwd?: unknown; text?: unknown; model?: unknown; effort?: unknown }
      | null;
    const cwd = typeof body?.cwd === "string" ? body.cwd.trim() : "";
    if (!cwd) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "cwd is required" } }, 400);
    }

    const text = parseOptionalString(body?.text);
    if (
      body?.text !== undefined &&
      (text === undefined || text === null || !text)
    ) {
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "text must be a non-empty string" } },
        400,
      );
    }
    if (!summary.capabilities.emptyCreateSession && text === undefined) {
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "text is required" } },
        400,
      );
    }

    const model = parseOptionalString(body?.model);
    if (body?.model !== undefined && model === undefined) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "model must be a string or null" } }, 400);
    }

    const effort = parseOptionalEffort(body?.effort);
    if (body?.effort !== undefined && effort === undefined) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "effort is invalid" } }, 400);
    }

    try {
      const result = await adapter.createSession({
        cwd,
        ...(text ? { text } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(effort !== undefined ? { effort } : {}),
      });
      return c.json(buildCreateSessionPayload(result));
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to create session");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.get("/:providerId/sessions/:sessionId/messages", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }

    try {
      const page = await adapter.getConversationPage(
        c.req.param("sessionId"),
        c.req.query("before") ?? null,
        parseLimit(c.req.query("limit")),
      );
      return c.json(page);
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to read conversation");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.get("/:providerId/sessions/:sessionId/messages/search", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    if (!adapter.searchConversation) {
      return c.json(
        { error: { code: "UNSUPPORTED_CAPABILITY", message: "Provider does not support conversation search" } },
        400,
      );
    }
    const query = c.req.query("q")?.trim() ?? "";
    if (!query) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "q is required" } }, 400);
    }
    const mode = parseSearchMode(c.req.query("mode"));
    if (!mode) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "mode is invalid" } }, 400);
    }

    try {
      return c.json(
        await adapter.searchConversation(
          c.req.param("sessionId"),
          query,
          mode,
          parseRecentLimit(c.req.query("recentLimit")),
        ),
      );
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to search conversation");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.get("/:providerId/sessions/:sessionId/messages/search-page", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    if (!adapter.searchConversationPage) {
      return c.json(
        { error: { code: "UNSUPPORTED_CAPABILITY", message: "Provider does not support paged conversation search" } },
        400,
      );
    }
    const query = c.req.query("q")?.trim() ?? "";
    if (!query) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "q is required" } }, 400);
    }
    const mode = parseSearchMode(c.req.query("mode"));
    if (!mode) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "mode is invalid" } }, 400);
    }

    const hasAnchorCursor =
      c.req.query("afterOffset") != null || c.req.query("afterBlockIndex") != null;
    const afterAnchor = hasAnchorCursor
      ? parseConversationAnchor(
          c.req.query("afterOffset"),
          c.req.query("afterBlockIndex"),
        )
      : null;
    if (hasAnchorCursor && !afterAnchor) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "search cursor is invalid" } }, 400);
    }

    try {
      return c.json(
        await adapter.searchConversationPage(
          c.req.param("sessionId"),
          query,
          mode,
          afterAnchor,
          parseSearchPageLimit(c.req.query("limit")),
          parseRecentLimit(c.req.query("recentLimit")),
        ),
      );
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to read conversation search page");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.get("/:providerId/sessions/:sessionId/messages/locate", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    if (!adapter.locateConversation) {
      return c.json(
        { error: { code: "UNSUPPORTED_CAPABILITY", message: "Provider does not support conversation locate" } },
        400,
      );
    }
    const messageId = c.req.query("messageId")?.trim() ?? "";
    if (!messageId) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "messageId is required" } }, 400);
    }
    const mode = parseSearchMode(c.req.query("mode"));
    if (!mode) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "mode is invalid" } }, 400);
    }

    try {
      const located = await adapter.locateConversation(
        c.req.param("sessionId"),
        messageId,
        mode,
        parseLocateWindow(c.req.query("window")),
      );
      if (!located) {
        return c.json({ error: { code: "SESSION_NOT_FOUND", message: "message not found" } }, 404);
      }
      return c.json(located);
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to locate conversation message");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.get("/:providerId/sessions/:sessionId/messages/context", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    if (!adapter.readConversationContext) {
      return c.json(
        { error: { code: "UNSUPPORTED_CAPABILITY", message: "Provider does not support conversation context" } },
        400,
      );
    }
    const mode = parseSearchMode(c.req.query("mode"));
    if (!mode) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "mode is invalid" } }, 400);
    }
    const anchor = parseConversationAnchor(
      c.req.query("offset"),
      c.req.query("blockIndex"),
    );
    if (!anchor) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "anchor is invalid" } }, 400);
    }

    try {
      const context = await adapter.readConversationContext(
        c.req.param("sessionId"),
        anchor,
        mode,
        parseLocateWindow(c.req.query("window")),
      );
      if (!context) {
        return c.json({ error: { code: "SESSION_NOT_FOUND", message: "context not found" } }, 404);
      }
      return c.json(context);
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to read conversation context");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.post("/:providerId/sessions/:sessionId/messages", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json({ error: { code: "INTERNAL_ERROR", message: "Provider not found" } }, 404);
    }
    if (!getProviderSummary(adapter).capabilities.send) {
      return c.json(
        { error: { code: "UNSUPPORTED_CAPABILITY", message: "Provider does not support send" } },
        400,
      );
    }

    const body = (await c.req.json().catch(() => null)) as
      | { text?: unknown; model?: unknown; effort?: unknown }
      | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "text is required" } },
        400,
      );
    }

    const model = parseOptionalString(body?.model);
    if (body?.model !== undefined && model === undefined) {
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "model must be a string or null" } },
        400,
      );
    }

    const effort = parseOptionalEffort(body?.effort);
    if (body?.effort !== undefined && effort === undefined) {
      return c.json(
        { error: { code: "INTERNAL_ERROR", message: "effort is invalid" } },
        400,
      );
    }

    try {
      const result = await adapter.sendMessage(c.req.param("sessionId"), {
        text,
        ...(model !== undefined ? { model } : {}),
        ...(effort !== undefined ? { effort } : {}),
      });
      return c.json({
        ok: true,
        turnId: result.turnId,
        outputText: result.outputText,
      });
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to send message");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  registerProviderStateRoutes(router, registry, config);
  registerProviderStreamRoutes(router, registry);
  return router;
}
