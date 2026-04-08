import { Hono } from "hono";
import type { RuntimeConfig } from "./config";
import type { ProviderAdapter, ProviderId } from "./types";
import type { AsrRegistry } from "./asr/types";
import { createAuthGuard } from "./auth";
import { createAsrRegistry } from "./asr/registry";
import { createAsrService } from "./asr/service";
import { createRuntimeController, type RuntimeController } from "./runtime-control";
import { createAuthRouter } from "./routes/auth";
import { createAsrRouter } from "./routes/asr";
import { createProvidersRouter } from "./routes/providers";
import { createRuntimeRouter } from "./routes/runtime";
import { createProviderRegistry } from "./providers/registry";

interface AppDependencies {
  registry?: Record<ProviderId, ProviderAdapter>;
  asrRegistry?: AsrRegistry;
  runtimeController?: RuntimeController;
}

export function createApp(config: RuntimeConfig, dependencies: AppDependencies = {}) {
  const app = new Hono();
  const providers = dependencies.registry ?? createProviderRegistry();
  const asrProviders = dependencies.asrRegistry ?? createAsrRegistry();
  const asrService = createAsrService(asrProviders);
  const runtimeController =
    dependencies.runtimeController ?? createRuntimeController();
  const authGuard = createAuthGuard(config);

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", createAuthRouter(config));
  app.use("/api/providers/*", authGuard);
  app.route("/api/providers", createProvidersRouter(providers, config));
  app.use("/api/runtime/*", authGuard);
  app.route("/api/runtime", createRuntimeRouter(config, runtimeController));
  app.use("/api/asr/*", authGuard);
  app.route("/api/asr", createAsrRouter(asrService, config));
  return app;
}
