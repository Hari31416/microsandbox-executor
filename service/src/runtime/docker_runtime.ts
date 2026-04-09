import type { SandboxRuntime, RuntimeHealth, RuntimeJobInput, RuntimeJobResult } from "./types.js";

export class DockerRuntime implements SandboxRuntime {
  async executeJob(_input: RuntimeJobInput): Promise<RuntimeJobResult> {
    throw new Error("DockerRuntime is not implemented yet");
  }

  async healthCheck(): Promise<RuntimeHealth> {
    return {
      ok: false,
      runtime: "docker",
      details: "runtime adapter stub only"
    };
  }
}
