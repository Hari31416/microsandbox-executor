import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { JobExecutor } from "./jobs/executor.js";
import { InMemoryJobStore } from "./jobs/queue.js";
import { DockerRuntime } from "./runtime/docker_runtime.js";
import { MicrosandboxRuntime } from "./runtime/microsandbox_runtime.js";
import { S3SessionStorage } from "./storage/s3.js";
import { WorkspaceSync } from "./storage/sync.js";

async function main() {
  const config = loadConfig();
  const runtime = config.runtime === "microsandbox" ? new MicrosandboxRuntime() : new DockerRuntime();
  const storage = new S3SessionStorage(config.s3);
  const sync = new WorkspaceSync(storage);
  const jobStore = new InMemoryJobStore();
  const executor = new JobExecutor(config, runtime, sync, jobStore);

  const app = await buildApp({
    config,
    runtime,
    storage,
    sync,
    jobStore,
    executor
  });

  await app.listen({
    host: config.host,
    port: config.port
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
