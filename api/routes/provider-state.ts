import type { Hono } from "hono";
import { rejectInvalidWriteOrigin } from "../auth";
import type { RuntimeConfig } from "../config";
import type {
  ProviderAdapter,
  ProviderId,
  ProviderUserInputResponsePayload,
} from "../types";
import { getProviderSummary } from "../providers/registry";
import { resolveProviderThreadStateSnapshot } from "./provider-runtime-state";
import { resolveProviderRouteError } from "./provider-route-errors";
import { findAdapter } from "./providers";

function providerNotFound() {
  return {
    error: { code: "INTERNAL_ERROR", message: "Provider not found" },
  };
}

function unsupportedCapability(message: string) {
  return {
    error: { code: "UNSUPPORTED_CAPABILITY", message },
  };
}

function parseTurnId(value: string | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseUserInputBody(
  body: unknown,
): ProviderUserInputResponsePayload | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const answers = (body as { answers?: unknown }).answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return null;
  }

  return {
    answers: answers as ProviderUserInputResponsePayload["answers"],
  };
}

export function registerProviderStateRoutes(
  router: Hono,
  registry: Record<ProviderId, ProviderAdapter>,
  config: RuntimeConfig,
) {
  router.get("/:providerId/sessions/:sessionId/context", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json(providerNotFound(), 404);
    }
    if (!adapter.getSessionContext) {
      return c.json(
        unsupportedCapability("Provider does not support session context"),
        400,
      );
    }

    try {
      return c.json(await adapter.getSessionContext(c.req.param("sessionId")));
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to read session context");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.get("/:providerId/sessions/:sessionId/state", async (c) => {
    const providerId = c.req.param("providerId") as ProviderId;
    const adapter = findAdapter(registry, providerId);
    if (!adapter) {
      return c.json(providerNotFound(), 404);
    }
    if (!getProviderSummary(adapter).capabilities.threadState || !adapter.getThreadState) {
      return c.json(
        unsupportedCapability("Provider does not support thread state"),
        400,
      );
    }

    try {
      return c.json(
        await resolveProviderThreadStateSnapshot({
          adapter: adapter as ProviderAdapter & {
            getThreadState: NonNullable<ProviderAdapter["getThreadState"]>;
          },
          providerId,
          requestedTurnId: parseTurnId(c.req.query("turnId")),
          sessionId: c.req.param("sessionId"),
        }),
      );
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to read thread state");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.post("/:providerId/sessions/:sessionId/interrupt", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json(providerNotFound(), 404);
    }
    if (!getProviderSummary(adapter).capabilities.interrupt || !adapter.interruptSession) {
      return c.json(
        unsupportedCapability("Provider does not support interrupt"),
        400,
      );
    }

    try {
      await adapter.interruptSession(c.req.param("sessionId"));
      return c.json({ ok: true });
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to interrupt session");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.get("/:providerId/sessions/:sessionId/requests/user-input", async (c) => {
    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json(providerNotFound(), 404);
    }
    if (!getProviderSummary(adapter).capabilities.userInput || !adapter.listUserInputRequests) {
      return c.json(
        unsupportedCapability("Provider does not support user input"),
        400,
      );
    }

    try {
      return c.json({
        requests: await adapter.listUserInputRequests(c.req.param("sessionId")),
      });
    } catch (error) {
      const resolved = resolveProviderRouteError(
        error,
        "Failed to list user input requests",
      );
      return c.json({ error: resolved.error }, resolved.status);
    }
  });

  router.post(
    "/:providerId/sessions/:sessionId/requests/user-input/:requestId/respond",
    async (c) => {
      const rejected = rejectInvalidWriteOrigin(c, config);
      if (rejected) {
        return rejected;
      }

      const adapter = findAdapter(registry, c.req.param("providerId"));
      if (!adapter) {
        return c.json(providerNotFound(), 404);
      }
      if (!getProviderSummary(adapter).capabilities.userInput || !adapter.submitUserInput) {
        return c.json(
          unsupportedCapability("Provider does not support user input"),
          400,
        );
      }

      const body = parseUserInputBody(await c.req.json().catch(() => null));
      if (!body) {
        return c.json(
          { error: { code: "INTERNAL_ERROR", message: "response.answers must be an object" } },
          400,
        );
      }

      try {
        await adapter.submitUserInput(
          c.req.param("sessionId"),
          c.req.param("requestId"),
          body,
        );
        return c.json({ ok: true });
      } catch (error) {
        const resolved = resolveProviderRouteError(
          error,
          "Failed to submit user input",
          ["response.answers", "stale user input request"],
        );
        return c.json({ error: resolved.error }, resolved.status);
      }
    },
  );

  router.delete("/:providerId/sessions/:sessionId", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    const adapter = findAdapter(registry, c.req.param("providerId"));
    if (!adapter) {
      return c.json(providerNotFound(), 404);
    }
    if (!getProviderSummary(adapter).capabilities.deleteSession || !adapter.deleteSession) {
      return c.json(unsupportedCapability("Provider does not support session deletion"), 400);
    }

    try {
      await adapter.deleteSession(c.req.param("sessionId"));
      return c.json({ ok: true });
    } catch (error) {
      const resolved = resolveProviderRouteError(error, "Failed to delete session");
      return c.json({ error: resolved.error }, resolved.status);
    }
  });
}
