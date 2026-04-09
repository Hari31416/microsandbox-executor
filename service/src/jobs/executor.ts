import type { AppConfig } from "../config.js";
import { preparePythonExecution } from "../policy/restricted_exec.js";
import type { SandboxRuntime } from "../runtime/types.js";
import { createJobWorkspace, cleanupJobWorkspace } from "../storage/workspace.js";
import { createSandboxName, createJobId } from "../util/ids.js";
import { captureManifest, diffManifests } from "./manifests.js";
import type { ExecuteRequest, JobRecord } from "./models.js";
import { InMemoryJobStore } from "./queue.js";
import { WorkspaceSync } from "../storage/sync.js";

export class JobExecutor {
  constructor(
    private readonly config: AppConfig,
    private readonly runtime: SandboxRuntime,
    private readonly sync: WorkspaceSync,
    private readonly jobStore: InMemoryJobStore
  ) {}

  async execute(request: ExecuteRequest) {
    const jobId = request.jobId ?? createJobId();
    const runtimeImage = this.resolveRuntimeImage(request.pythonProfile);
    this.validateRequest(request);

    console.info("[executor] starting job", {
      jobId,
      sessionId: request.sessionId,
      pythonProfile: request.pythonProfile,
      image: runtimeImage,
      entrypoint: request.entrypoint,
      fileCount: request.filePaths.length
    });

    this.jobStore.create(jobId, {
      ...request,
      jobId
    });
    this.jobStore.markRunning(jobId);

    const workspace = await createJobWorkspace(this.config.scratchRoot, request.sessionId, jobId);

    try {
      console.info("[executor] staging workspace files", {
        jobId,
        workspacePath: workspace.workspacePath
      });
      await this.sync.stageFiles(request.filePaths, workspace.workspacePath);
      const beforeManifest = await captureManifest(workspace.workspacePath);

      const preparedExecution = await preparePythonExecution({
        workspacePath: workspace.workspacePath,
        entrypoint: request.entrypoint,
        code: request.code,
        enableRestrictedExec: request.restrictedExec ?? this.config.enableRestrictedExec,
        blockedImports: this.config.blockedImports
      });

      console.info("[executor] launching runtime", {
        jobId,
        sandboxName: createSandboxName(jobId),
        image: runtimeImage,
        timeoutSeconds: request.timeoutSeconds ?? this.config.defaultTimeoutSeconds,
        cpuLimit: request.cpuLimit ?? this.config.defaultCpuLimit,
        memoryMb: request.memoryMb ?? this.config.defaultMemoryMb
      });
      const runtimeResult = await this.runtime.executeJob({
        sandboxName: createSandboxName(jobId),
        image: runtimeImage,
        workspaceHostPath: workspace.workspacePath,
        guestWorkspacePath: this.config.guestWorkspacePath,
        command: preparedExecution.command,
        args: preparedExecution.args,
        timeoutMs: (request.timeoutSeconds ?? this.config.defaultTimeoutSeconds) * 1000,
        cpuLimit: request.cpuLimit ?? this.config.defaultCpuLimit,
        memoryMb: request.memoryMb ?? this.config.defaultMemoryMb,
        environment: request.environment,
        networkMode: request.networkMode,
        allowedHosts: request.allowedHosts
      });

      const afterManifest = await captureManifest(workspace.workspacePath, preparedExecution.ignoredRelativePrefixes);
      const diff = diffManifests(beforeManifest, afterManifest);
      const uploadedFiles = await this.sync.persistFiles(workspace.workspacePath, diff.changedFiles);

      console.info("[executor] completed job", {
        jobId,
        exitCode: runtimeResult.exitCode,
        durationMs: runtimeResult.durationMs,
        uploadedFileCount: uploadedFiles.length
      });

      return this.jobStore.complete(jobId, {
        exitCode: runtimeResult.exitCode,
        stdout: runtimeResult.stdout,
        stderr: runtimeResult.stderr,
        durationMs: runtimeResult.durationMs,
        filesUploaded: uploadedFiles
      });
    } catch (error) {
      console.error("[executor] job failed", {
        jobId,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      return this.jobStore.fail(jobId, error);
    } finally {
      console.info("[executor] cleaning workspace", {
        jobId,
        jobRoot: workspace.jobRoot
      });
      await cleanupJobWorkspace(workspace.jobRoot);
    }
  }

  get(jobId: string): JobRecord | null {
    return this.jobStore.get(jobId);
  }

  private validateRequest(request: ExecuteRequest) {
    if ((request.timeoutSeconds ?? this.config.defaultTimeoutSeconds) > this.config.maxTimeoutSeconds) {
      throw new Error(`timeout_seconds exceeds max allowed value of ${this.config.maxTimeoutSeconds}`);
    }

    if ((request.cpuLimit ?? this.config.defaultCpuLimit) > this.config.maxCpuLimit) {
      throw new Error(`cpu_limit exceeds max allowed value of ${this.config.maxCpuLimit}`);
    }

    if ((request.memoryMb ?? this.config.defaultMemoryMb) > this.config.maxMemoryMb) {
      throw new Error(`memory_mb exceeds max allowed value of ${this.config.maxMemoryMb}`);
    }
  }

  private resolveRuntimeImage(profile: ExecuteRequest["pythonProfile"]) {
    return this.config.runtimeImages[profile ?? "default"] ?? this.config.runtimeImages.default;
  }
}
