import { z } from "zod";

const createSessionResponseSchema = z.object({
  session_id: z.string(),
  created_at: z.string(),
  expires_at: z.string()
});

const sessionFilesResponseSchema = z.object({
  session_id: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number(),
      content_type: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string()
    })
  )
});

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
    file_paths?: string[];
    code: string;
    entrypoint?: string;
    python_profile?: "default" | "data-science";
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

  async executeBash(payload: {
    session_id: string;
    file_paths?: string[];
    script: string;
    entrypoint?: string;
    network_mode?: "none" | "allowlist" | "public";
    allowed_hosts?: string[];
  }) {
    const response = await fetch(`${this.baseUrl}/v1/execute/bash`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        entrypoint: "main.sh",
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

  async createSession(sessionId?: string) {
    const response = await fetch(`${this.baseUrl}/v1/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {})
    });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(typeof json?.error === "string" ? json.error : "Session creation failed");
    }

    return createSessionResponseSchema.parse(json);
  }

  async uploadFiles(sessionId: string, files: Array<{ name: string; buffer: Buffer; contentType?: string }>) {
    const formData = new FormData();

    for (const file of files) {
      formData.append(
        "files",
        new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
        file.name
      );
    }

    const response = await fetch(`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/files`, {
      method: "POST",
      body: formData
    });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(typeof json?.error === "string" ? json.error : "Upload failed");
    }

    return json as {
      session_id: string;
      file_paths: string[];
      files: Array<{ path: string; size: number; content_type: string | null; updated_at: string }>;
    };
  }

  async listFiles(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/files`);
    const json = await response.json();

    if (!response.ok) {
      throw new Error(typeof json?.error === "string" ? json.error : "List files failed");
    }

    return sessionFilesResponseSchema.parse(json);
  }

  async downloadFile(sessionId: string, relativePath: string) {
    const response = await fetch(
      `${this.baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}/files/${relativePath
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`
    );

    if (!response.ok) {
      const json = await response.json().catch(() => null);
      throw new Error(typeof json?.error === "string" ? json.error : "Download failed");
    }

    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      contentDisposition: response.headers.get("content-disposition") ?? undefined
    };
  }
}
