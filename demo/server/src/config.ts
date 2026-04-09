import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseDotenv } from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8787),
  EXECUTOR_BASE_URL: z.string().url().default("http://127.0.0.1:3000"),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  DEMO_PREFIX: z.string().min(1).default("demo")
});

const SERVER_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPO_ROOT = resolve(SERVER_ROOT, "../..");
const ROOT_ENV_FILE = resolve(REPO_ROOT, ".env");

export type DemoConfig = ReturnType<typeof loadConfig>;

export function loadEnvFile(explicitPath = process.env.ENV_FILE) {
  const shellKeys = new Set(Object.keys(process.env));
  const loadedPaths: string[] = [];

  applyEnvFile(ROOT_ENV_FILE, shellKeys, loadedPaths);

  if (explicitPath) {
    applyEnvFile(resolve(explicitPath), shellKeys, loadedPaths);
  }

  return loadedPaths;
}

function applyEnvFile(envFilePath: string, shellKeys: Set<string>, loadedPaths: string[]) {
  if (!existsSync(envFilePath)) {
    return;
  }

  const parsed = parseDotenv(readFileSync(envFilePath));

  for (const [key, value] of Object.entries(parsed)) {
    if (!shellKeys.has(key)) {
      process.env[key] = value;
    }
  }

  loadedPaths.push(envFilePath);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    executorBaseUrl: parsed.EXECUTOR_BASE_URL,
    s3: {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      bucket: parsed.S3_BUCKET,
      accessKeyId: parsed.S3_ACCESS_KEY_ID,
      secretAccessKey: parsed.S3_SECRET_ACCESS_KEY,
      forcePathStyle: parsed.S3_FORCE_PATH_STYLE
    },
    demoPrefix: parsed.DEMO_PREFIX.replace(/^\/+|\/+$/g, "")
  };
}
