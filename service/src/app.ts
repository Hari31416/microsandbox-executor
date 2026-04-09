import Fastify from "fastify";

import type { AppConfig } from "./config.js";
import { JobExecutor } from "./jobs/executor.js";
import { InMemoryJobStore } from "./jobs/queue.js";
import type { SandboxRuntime } from "./runtime/types.js";
import { WorkspaceSync } from "./storage/sync.js";
import type { SessionStorage } from "./storage/types.js";
import { registerExecuteRoutes } from "./routes/execute.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { createLoggerOptions } from "./util/logging.js";

export interface AppServices {
  config: AppConfig;
  runtime: SandboxRuntime;
  storage: SessionStorage;
  sync: WorkspaceSync;
  jobStore: InMemoryJobStore;
  executor: JobExecutor;
}

export async function buildApp(services: AppServices) {
  const app = Fastify({
    logger: createLoggerOptions(services.config)
  });

  await registerHealthRoutes(app, services);
  await registerExecuteRoutes(app, services);
  await registerJobRoutes(app, services);

  return app;
}
