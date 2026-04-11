import { randomUUID } from "node:crypto";
import { extname } from "node:path";

import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { z } from "zod";

import { loadConfig, loadEnvFile } from "./config.js";
import { ExecutorClient } from "./executor-client.js";

const executeRequestSchema = z.object({
  sessionId: z.string().min(1),
  filePaths: z.array(z.string().min(1)).optional(),
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

  const executor = new ExecutorClient(config.executorBaseUrl);

  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 10
    }
  });

  app.get("/api/health", async () => {
    const executorHealth = await executor
      .health()
      .then((value) => ({ ok: true, value }))
      .catch((error) => ({ ok: false, error: formatError(error) }));

    return {
      status: executorHealth.ok ? "ok" : "degraded",
      executor: executorHealth
    };
  });

  app.post("/api/uploads", async (request, reply) => {
    const parts = request.parts();
    let sessionId: string | undefined;
    const uploads: Array<{ name: string; buffer: Buffer; contentType?: string }> = [];

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "sessionId" && typeof part.value === "string" && part.value.trim()) {
          sessionId = part.value.trim();
        }

        continue;
      }

      uploads.push({
        name: sanitizeFilename(part.filename ?? "upload.bin"),
        buffer: await part.toBuffer(),
        contentType: part.mimetype
      });
    }

    if (uploads.length === 0) {
      return reply.code(400).send({
        error: "At least one file is required"
      });
    }

    const session = sessionId ? { session_id: sessionId } : await executor.createSession(`demo-${randomUUID()}`);
    const uploadResult = await executor.uploadFiles(session.session_id, uploads);
    const listedFiles = await executor.listFiles(session.session_id);
    const csvFile = listedFiles.files.find((file) => file.path.toLowerCase().endsWith(".csv"));
    const suggestedOutputPath = csvFile
      ? `${filenameStem(csvFile.path)}_cleaned.csv`
      : `result${pickDefaultExtension(listedFiles.files[0]?.path ?? "")}`;

    return {
      sessionId: session.session_id,
      sessionRoot: session.session_id,
      suggestedEntrypoint: "main.py",
      filePaths: uploadResult.file_paths,
      files: listedFiles.files.map((file) => ({
        name: basenameFromKey(file.path),
        key: file.path,
        workspacePath: file.path,
        size: file.size,
        contentType: file.content_type ?? undefined
      })),
      suggestedOutputPath,
      suggestedCode: buildSuggestedCode(listedFiles.files.map((file) => file.path), suggestedOutputPath)
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
      downloads: result.files_uploaded.map((path) => ({
        key: path,
        url: `/api/files?sessionId=${encodeURIComponent(payload.sessionId)}&path=${encodeURIComponent(path)}`
      }))
    });
  });

  app.get("/api/files", async (request, reply) => {
    const query = request.query as { sessionId?: string; path?: string };

    if (!query.sessionId || !query.path) {
      return reply.code(400).send({ error: "sessionId and path are required" });
    }

    const file = await executor.downloadFile(query.sessionId, query.path);

    reply.header("content-type", file.contentType);
    if (file.contentDisposition) {
      reply.header("content-disposition", file.contentDisposition);
    }
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

# Load the CSV from the workspace root
print(f"Reading dataset: {input_path.name}")
df = pd.read_csv(input_path)

# Example cleanup: drop fully empty rows and normalize column names
cleaned = df.dropna(how="all").copy()
cleaned.columns = [str(column).strip().lower().replace(" ", "_") for column in cleaned.columns]

print("\\n--- Preview ---")
print(cleaned.head())

print("\\nRows:", len(cleaned))
print("Columns:", cleaned.columns.tolist())

# Saving to a short local path is enough. The executor will sync it to the session's outputs prefix.
output_path.parent.mkdir(parents=True, exist_ok=True)
cleaned.to_csv(output_path, index=False)

print(f"\\nCleaned dataset successfully saved to {output_path}")
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

function filenameStem(filename: string) {
  const extension = extname(filename);
  return extension ? filename.slice(0, -extension.length) : filename;
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
