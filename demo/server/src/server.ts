import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { z } from "zod";

import { loadConfig, loadEnvFile } from "./config.js";
import { ExecutorClient } from "./executor-client.js";
import { DemoStorage } from "./storage.js";

const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  filePaths: z.array(z.string().min(1)).min(1),
  entrypoint: z.string().min(1),
  pythonProfile: z.enum(["default", "data-science"]).default("default"),
  code: z.string().min(1)
});

async function main() {
  loadEnvFile();
  const config = loadConfig();
  const app = Fastify({
    logger: {
      level: "info"
    }
  });

  const storage = new DemoStorage(config.s3);
  const executor = new ExecutorClient(config.executorBaseUrl);

  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 10
    }
  });

  app.get("/api/health", async () => {
    const [storageHealth, executorHealth] = await Promise.all([
      storage.healthCheck().then(() => ({ ok: true })).catch((error) => ({ ok: false, error: formatError(error) })),
      executor.health().then((value) => ({ ok: true, value })).catch((error) => ({ ok: false, error: formatError(error) }))
    ]);

    return {
      status: storageHealth.ok && executorHealth.ok ? "ok" : "degraded",
      storage: storageHealth,
      executor: executorHealth
    };
  });

  app.post("/api/uploads", async (request, reply) => {
    const parts = request.parts();
    let sessionId: string | undefined;
    const uploads: Array<{ name: string; key: string; size: number; contentType: string | undefined }> = [];

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "sessionId" && typeof part.value === "string" && part.value.trim()) {
          sessionId = part.value.trim();
        }

        continue;
      }

      sessionId ??= `demo-${randomUUID()}`;
      const filename = sanitizeFilename(part.filename ?? "upload.bin");
      const key = `${config.demoPrefix}/${sessionId}/inputs/${filename}`;
      const buffer = await part.toBuffer();

      await storage.uploadObject(key, buffer, part.mimetype);
      uploads.push({
        name: filename,
        key,
        size: buffer.byteLength,
        contentType: part.mimetype
      });
    }

    if (!sessionId || uploads.length === 0) {
      return reply.code(400).send({
        error: "At least one file is required"
      });
    }

    const sessionRoot = `${config.demoPrefix}/${sessionId}`;
    const suggestedEntrypoint = `${sessionRoot}/scripts/main.py`;
    const csvFile = uploads.find((file) => file.name.toLowerCase().endsWith(".csv"));
    const suggestedOutputPath = csvFile
      ? `${sessionRoot}/outputs/${csvFile.name.split(".")[0]}-metadata.txt`
      : `${sessionRoot}/outputs/result${pickDefaultExtension(uploads[0]?.name ?? "")}`;

    return {
      sessionId,
      sessionRoot,
      suggestedEntrypoint,
      filePaths: uploads.map((file) => file.key),
      files: uploads,
      suggestedOutputPath,
      suggestedCode: buildSuggestedCode(uploads.map((file) => file.key), suggestedOutputPath)
    };
  });

  app.post("/api/execute", async (request, reply) => {
    const payload = executeRequestSchema.parse(request.body);
    const result = await executor.execute({
      session_id: payload.sessionId,
      file_paths: payload.filePaths,
      entrypoint: payload.entrypoint,
      python_profile: payload.pythonProfile,
      code: payload.code
    });

    return reply.send({
      ...result,
      downloads: result.files_uploaded.map((key) => ({
        key,
        url: `/api/files?key=${encodeURIComponent(key)}`
      }))
    });
  });

  app.get("/api/files", async (request, reply) => {
    const query = request.query as { key?: string };

    if (!query.key) {
      return reply.code(400).send({ error: "key is required" });
    }

    const file = await storage.downloadObject(query.key);

    reply.header("content-type", file.contentType);
    reply.header("content-disposition", `inline; filename="${basenameFromKey(query.key)}"`);
    return reply.send(file.body);
  });

  await app.listen({
    host: config.host,
    port: config.port
  });
}

function buildSuggestedCode(filePaths: string[], outputPath: string) {
  const csvPath = filePaths.find((p) => p.toLowerCase().endsWith(".csv"));
  const inputPath = JSON.stringify(csvPath || filePaths[0] || "");
  const outputLiteral = JSON.stringify(outputPath);

  if (csvPath) {
    return `import pandas as pd
from pathlib import Path

input_path = Path(${inputPath})
output_path = Path(${outputLiteral})

# Load the CSV data using pandas
print(f"Reading dataset: {input_path.name}")
df = pd.read_csv(input_path)

# Print dataset information to the console
print("\\n--- DataFrame Info ---")
print(df.info())

print("\\n--- Column Names ---")
print(df.columns.tolist())

# Save column metadata to the output file
output_path.parent.mkdir(parents=True, exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    f.write(f"Schema for {input_path.name}\\n")
    f.write("=" * 40 + "\\n")
    for col in df.columns:
        f.write(f"Column: {col:20} Type: {str(df[col].dtype)}\\n")

print(f"\\nColumn metadata successfully saved to {output_path}")
`;
  }

  return `from pathlib import Path

input_path = Path(${inputPath})
output_path = Path(${outputLiteral})

print(f"Processing {input_path}...")
text = input_path.read_text(encoding="utf-8")

# Default transformation: convert to uppercase
transformed = text.upper()

output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(transformed, encoding="utf-8")

print(f"Successfully wrote transformed output to {output_path}")
`;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function pickDefaultExtension(filename: string) {
  const extension = extname(filename);
  return extension || ".txt";
}

function basenameFromKey(key: string) {
  const segments = key.split("/");
  return segments[segments.length - 1] || "download.bin";
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
