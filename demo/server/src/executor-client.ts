import { z } from "zod";

const executeResponseSchema = z.object({
  job_id: z.string(),
  session_id: z.string(),
  status: z.string(),
  exit_code: z.number().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  duration_ms: z.number().nullable(),
  files_uploaded: z.array(z.string()),
  created_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable()
});

const healthResponseSchema = z.object({
  status: z.string(),
  runtime: z.record(z.any()),
  storage: z.record(z.any())
});

export class ExecutorClient {
  constructor(private readonly baseUrl: string) {}

  async health() {
    const response = await fetch(`${this.baseUrl}/v1/health`);
    const json = await response.json();

    if (!response.ok) {
      throw new Error(`Executor health check failed: ${JSON.stringify(json)}`);
    }

    return healthResponseSchema.parse(json);
  }

  async execute(payload: {
    session_id: string;
    file_paths: string[];
    code: string;
    network_mode?: "none" | "allowlist" | "public";
    allowed_hosts?: string[];
  }) {
    const response = await fetch(`${this.baseUrl}/v1/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        entrypoint: "main.py",
        network_mode: "none",
        allowed_hosts: [],
        ...payload
      })
    });

    const json = await response.json();

    if (!response.ok) {
      throw new Error(typeof json?.error === "string" ? json.error : "Executor request failed");
    }

    return executeResponseSchema.parse(json);
  }
}
