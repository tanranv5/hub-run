import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import open from "open";
import type { ServerType } from "@hono/node-server";
import type { RuntimeConfig } from "./config";
import { createApp } from "./app";
import { closeCodexAppServerClient } from "./providers/transports/codex-app-server";

function getWebDistPath(): string {
  const filePath = fileURLToPath(import.meta.url);
  return join(dirname(filePath), "../dist/web");
}

export function createServer(config: RuntimeConfig) {
  const app = createApp(config);
  const webDistPath = getWebDistPath();

  app.use("/*", serveStatic({ root: webDistPath }));

  app.get("/*", async (c) => {
    const indexPath = join(webDistPath, "index.html");
    try {
      return c.html(readFileSync(indexPath, "utf-8"));
    } catch {
      return c.text("UI not found. Run 'pnpm build' first.", 404);
    }
  });

  let httpServer: ServerType | null = null;

  return {
    app,
    start: async () => {
      const url = `http://${config.host}:${config.port}/`;
      httpServer = serve({
        fetch: app.fetch,
        hostname: config.host,
        port: config.port,
      });
      if (!config.dev && config.open) {
        open(url).catch(console.error);
      }
      return httpServer;
    },
    stop: async () => {
      await closeCodexAppServerClient().catch(() => undefined);
      httpServer?.close();
    },
  };
}
