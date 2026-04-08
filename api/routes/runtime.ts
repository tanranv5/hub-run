import { Hono } from "hono";
import { existsSync, statSync } from "node:fs";
import { rejectInvalidWriteOrigin } from "../auth";
import type { RuntimeConfig } from "../config";
import { RuntimeControllerError, type RuntimeController } from "../runtime-control";

function buildRuntimeRestartError(error: unknown) {
  if (error instanceof RuntimeControllerError) {
    return {
      payload: {
        error: {
          code: "INTERNAL_ERROR",
          message: error.message,
        },
      },
      status: error.statusCode as 404 | 500,
    };
  }
  return {
    payload: {
      error: {
        code: "INTERNAL_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to restart runtime",
      },
    },
    status: 500 as const,
  };
}

export function createRuntimeRouter(
  config: RuntimeConfig,
  runtimeController: RuntimeController,
) {
  const router = new Hono();

  router.post("/restart", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    try {
      await runtimeController.restart();
      return c.json({ ok: true, restarting: true });
    } catch (error) {
      const response = buildRuntimeRestartError(error);
      return c.json(response.payload, response.status);
    }
  });

  router.get("/path-exists", (c) => {
    const path = c.req.query("path")?.trim();
    if (!path) {
      return c.json({ exists: false, isDirectory: false });
    }
    try {
      const exists = existsSync(path);
      const isDirectory = exists && statSync(path).isDirectory();
      return c.json({ exists, isDirectory });
    } catch {
      return c.json({ exists: false, isDirectory: false });
    }
  });

  return router;
}
