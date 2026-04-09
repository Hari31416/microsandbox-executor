import { Client } from "minio";
import { join } from "node:path";

import type { AppConfig } from "../config.js";
import { resolveWithin, writeStreamToFile } from "../util/fs.js";

type MinioClient = Client | null;

export interface StorageHealth {
  ok: boolean;
  configured: boolean;
  details: string;
}

export class MinioSessionStorage {
  private readonly client: MinioClient;

  constructor(private readonly config: AppConfig["minio"]) {
    this.client = config.configured
      ? new Client({
          endPoint: config.endpoint!,
          port: config.port,
          useSSL: config.useSSL,
          accessKey: config.accessKey!,
          secretKey: config.secretKey!,
          region: config.region
        })
      : null;
  }

  isConfigured() {
    return Boolean(this.client);
  }

  async healthCheck(): Promise<StorageHealth> {
    if (!this.client) {
      return {
        ok: true,
        configured: false,
        details: "MinIO is not configured"
      };
    }

    try {
      const exists = await this.client.bucketExists(this.config.bucket!);

      return {
        ok: exists,
        configured: true,
        details: exists ? "bucket reachable" : "bucket does not exist"
      };
    } catch (error) {
      return {
        ok: false,
        configured: true,
        details: error instanceof Error ? error.message : "failed to reach MinIO"
      };
    }
  }

  async downloadSession(sessionId: string, workspacePath: string) {
    if (!this.client) {
      return [];
    }

    const prefix = this.objectPrefix(sessionId);
    const objectNames = await this.listObjectNames(prefix);
    const downloadedFiles: string[] = [];

    for (const objectName of objectNames) {
      const relativePath = objectName.slice(prefix.length);

      if (!relativePath) {
        continue;
      }

      const objectStream = await this.client.getObject(this.config.bucket!, objectName);
      await writeStreamToFile(objectStream, resolveWithin(workspacePath, relativePath));
      downloadedFiles.push(relativePath);
    }

    downloadedFiles.sort();
    return downloadedFiles;
  }

  async uploadFiles(sessionId: string, workspacePath: string, relativePaths: string[]) {
    if (!this.client || relativePaths.length === 0) {
      return [];
    }

    const uploaded: string[] = [];

    for (const relativePath of relativePaths) {
      const objectName = `${this.objectPrefix(sessionId)}${relativePath}`;
      const absolutePath = resolveWithin(workspacePath, relativePath);

      await this.client.fPutObject(this.config.bucket!, objectName, absolutePath);
      uploaded.push(relativePath);
    }

    uploaded.sort();
    return uploaded;
  }

  private objectPrefix(sessionId: string) {
    return `${trimSlashes(this.config.sessionPrefix)}/${sessionId}/`;
  }

  private async listObjectNames(prefix: string) {
    const objects = await new Promise<string[]>((resolve, reject) => {
      const names: string[] = [];
      const stream = this.client!.listObjectsV2(this.config.bucket!, prefix, true);

      stream.on("data", (item) => {
        if (item.name && !item.name.endsWith("/")) {
          names.push(item.name);
        }
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(names));
    });

    objects.sort();
    return objects;
  }
}

function trimSlashes(value: string) {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}
