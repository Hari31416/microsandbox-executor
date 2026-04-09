import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
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
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_SESSION_PREFIX: z.string().min(1).default("sessions"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().optional()
});

export type AppConfig = ReturnType<typeof loadConfig>;

const SERVICE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_ENV_FILE = resolve(SERVICE_ROOT, ".env");

export function loadEnvFile(explicitPath = process.env.ENV_FILE) {
  const envFilePath = explicitPath ? resolve(explicitPath) : DEFAULT_ENV_FILE;

  if (!existsSync(envFilePath)) {
    return null;
  }

  loadDotenv({
    path: envFilePath,
    override: false
  });

  return envFilePath;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const s3Configured =
    Boolean(parsed.S3_BUCKET) &&
    Boolean(parsed.S3_ACCESS_KEY_ID) &&
    Boolean(parsed.S3_SECRET_ACCESS_KEY);

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
    s3: {
      configured: s3Configured,
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      bucket: parsed.S3_BUCKET,
      accessKeyId: parsed.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
      sessionPrefix: parsed.S3_SESSION_PREFIX,
      forcePathStyle: parsed.S3_FORCE_PATH_STYLE ?? Boolean(parsed.S3_ENDPOINT)
    }
  };
}
