import { Mount, Sandbox, isInstalled } from "microsandbox";

import { buildNetworkConfig } from "../policy/network.js";
import type { SandboxRuntime, RuntimeHealth, RuntimeJobInput, RuntimeJobResult } from "./types.js";

export class MicrosandboxRuntime implements SandboxRuntime {
  async executeJob(input: RuntimeJobInput): Promise<RuntimeJobResult> {
    if (!isInstalled()) {
      throw new Error("microsandbox runtime is not installed. Install it before executing jobs.");
    }

    const sandbox = await Sandbox.create({
      name: input.sandboxName,
      image: input.image,
      cpus: input.cpuLimit,
      memoryMib: input.memoryMb,
      workdir: input.guestWorkspacePath,
      replace: true,
      env: {
        PYTHONUNBUFFERED: "1",
        ...input.environment
      },
      volumes: {
        [input.guestWorkspacePath]: Mount.bind(input.workspaceHostPath)
      },
      network: buildNetworkConfig(input.networkMode, input.allowedHosts)
    });

    const startedAt = Date.now();

    try {
      const output = await sandbox.execWithConfig({
        cmd: input.command,
        args: input.args,
        cwd: input.guestWorkspacePath,
        env: input.environment,
        timeoutMs: input.timeoutMs
      });

      return {
        exitCode: output.code,
        stdout: output.stdout(),
        stderr: output.stderr(),
        durationMs: Date.now() - startedAt
      };
    } finally {
      await this.cleanupSandbox(sandbox, input.sandboxName);
    }
  }

  async healthCheck(): Promise<RuntimeHealth> {
    if (!isInstalled()) {
      return {
        ok: false,
        runtime: "microsandbox",
        details: "microsandbox is not installed on this machine"
      };
    }

    try {
      await Sandbox.list();
      return {
        ok: true,
        runtime: "microsandbox",
        details: "runtime available"
      };
    } catch (error) {
      return {
        ok: false,
        runtime: "microsandbox",
        details: error instanceof Error ? error.message : "failed to query runtime"
      };
    }
  }

  private async cleanupSandbox(sandbox: Sandbox, sandboxName: string) {
    try {
      await sandbox.stopAndWait();
    } catch {
      try {
        await sandbox.kill();
      } catch {
        // Ignore cleanup failures and try to remove the persisted record.
      }
    }

    try {
      await Sandbox.remove(sandboxName);
    } catch {
      // Ignore missing or already-removed sandbox records.
    }
  }
}
