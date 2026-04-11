import Fastify from "fastify";

import type { AppConfig } from "./config.js";
import { JobExecutor } from "./jobs/executor.js";
import { MetadataStore } from "./metadata/store.js";
import type { SandboxRuntime } from "./runtime/types.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { SessionCleanupService } from "./sessions/cleanup.js";
import { SessionLockManager } from "./sessions/locks.js";
import { WorkspaceSync } from "./storage/sync.js";
import { LocalSessionStorage } from "./storage/local.js";
import { registerExecuteRoutes } from "./routes/execute.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { createLoggerOptions } from "./util/logging.js";

export interface AppServices {
  config: AppConfig;
  runtime: SandboxRuntime;
  storage: LocalSessionStorage;
  metadata: MetadataStore;
  locks: SessionLockManager;
  cleanup: SessionCleanupService;
  sync: WorkspaceSync;
  executor: JobExecutor;
}

export async function buildApp(services: AppServices) {
  const app = Fastify({
    logger: createLoggerOptions(services.config)
  });

  await registerHealthRoutes(app, services);
  await registerSessionRoutes(app, services);
  await registerExecuteRoutes(app, services);
  await registerJobRoutes(app, services);
  app.addHook("onClose", async () => {
    services.cleanup.stop();
    services.metadata.close();
  });

  return app;
}
