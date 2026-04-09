import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  RUNTIME: z.enum(["microsandbox", "docker"]).default("microsandbox"),
  MICROSANDBOX_IMAGE: z.string().min(1).default("python:3.12"),
  SCRATCH_ROOT: z.string().min(1).default("/tmp/agent-sandbox"),
  GUEST_WORKSPACE_PATH: z.string().min(1).default("/workspace"),
  DEFAULT_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(60),
  MAX_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(300),
  DEFAULT_CPU_LIMIT: z.coerce.number().int().positive().default(1),
  MAX_CPU_LIMIT: z.coerce.number().int().positive().default(4),
  DEFAULT_MEMORY_MB: z.coerce.number().int().positive().default(2048),
  MAX_MEMORY_MB: z.coerce.number().int().positive().default(4096),
  ENABLE_RESTRICTED_EXEC: z.coerce.boolean().default(true),
  RESTRICTED_EXEC_BLOCKED_IMPORTS: z.string().default("subprocess,socket,ctypes,multiprocessing,resource,pty"),
  HEALTHCHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z.string().optional(),
  MINIO_REGION: z.string().optional(),
  MINIO_SESSION_PREFIX: z.string().min(1).default("sessions")
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const minioConfigured =
    Boolean(parsed.MINIO_ENDPOINT) &&
    Boolean(parsed.MINIO_ACCESS_KEY) &&
    Boolean(parsed.MINIO_SECRET_KEY) &&
    Boolean(parsed.MINIO_BUCKET);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    runtime: parsed.RUNTIME,
    defaultImage: parsed.MICROSANDBOX_IMAGE,
    scratchRoot: parsed.SCRATCH_ROOT,
    guestWorkspacePath: parsed.GUEST_WORKSPACE_PATH,
    defaultTimeoutSeconds: parsed.DEFAULT_TIMEOUT_SECONDS,
    maxTimeoutSeconds: parsed.MAX_TIMEOUT_SECONDS,
    defaultCpuLimit: parsed.DEFAULT_CPU_LIMIT,
    maxCpuLimit: parsed.MAX_CPU_LIMIT,
    defaultMemoryMb: parsed.DEFAULT_MEMORY_MB,
    maxMemoryMb: parsed.MAX_MEMORY_MB,
    enableRestrictedExec: parsed.ENABLE_RESTRICTED_EXEC,
    blockedImports: parsed.RESTRICTED_EXEC_BLOCKED_IMPORTS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    healthcheckTimeoutMs: parsed.HEALTHCHECK_TIMEOUT_MS,
    minio: {
      configured: minioConfigured,
      endpoint: parsed.MINIO_ENDPOINT,
      port: parsed.MINIO_PORT,
      useSSL: parsed.MINIO_USE_SSL,
      accessKey: parsed.MINIO_ACCESS_KEY,
      secretKey: parsed.MINIO_SECRET_KEY,
      bucket: parsed.MINIO_BUCKET,
      region: parsed.MINIO_REGION,
      sessionPrefix: parsed.MINIO_SESSION_PREFIX
    }
  };
}
