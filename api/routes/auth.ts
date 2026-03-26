import { Hono } from "hono";
import type { RuntimeConfig } from "../config";
import {
  clearSessionCookie,
  isAuthenticated,
  issueSessionToken,
  rejectInvalidWriteOrigin,
  writeSessionCookie,
} from "../auth";

interface LoginBody {
  password?: string;
}

const INVALID_JSON = Symbol("INVALID_JSON");

function parseLoginBody(input: unknown): LoginBody {
  if (!input || typeof input !== "object") {
    return {};
  }
  return input as LoginBody;
}

export function createAuthRouter(config: RuntimeConfig) {
  const router = new Hono();

  router.get("/status", (c) => {
    return c.json({
      authEnabled: config.authEnabled,
      authenticated: isAuthenticated(c, config),
    });
  });

  router.post("/login", async (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    if (!config.authEnabled || !config.password) {
      return c.json({ ok: true, authEnabled: false });
    }

    const parsedBody = await c.req.json().catch(() => INVALID_JSON);
    if (parsedBody === INVALID_JSON) {
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Request body must be valid JSON",
          },
        },
        400,
      );
    }

    const body = parseLoginBody(parsedBody);
    if (body.password !== config.password) {
      return c.json(
        {
          error: {
            code: "AUTH_REQUIRED",
            message: "Invalid password",
          },
        },
        401,
      );
    }

    writeSessionCookie(c, issueSessionToken(config.password));
    return c.json({ ok: true, authEnabled: true });
  });

  router.post("/logout", (c) => {
    const rejected = rejectInvalidWriteOrigin(c, config);
    if (rejected) {
      return rejected;
    }

    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  return router;
}
