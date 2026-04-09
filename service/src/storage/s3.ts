import {
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import type { AppConfig } from "../config.js";
import { resolveWithin, writeStreamToFile } from "../util/fs.js";
import type { SessionStorage, StorageHealth } from "./types.js";

type S3CompatibleClient = S3Client | null;

export class S3SessionStorage implements SessionStorage {
  private readonly client: S3CompatibleClient;

  constructor(private readonly config: AppConfig["s3"]) {
    this.client = config.configured
      ? new S3Client({
          region: config.region,
          endpoint: config.endpoint,
          forcePathStyle: config.forcePathStyle,
          credentials: {
            accessKeyId: config.accessKeyId!,
            secretAccessKey: config.secretAccessKey!
          }
        })
      : null;
  }

  async healthCheck(): Promise<StorageHealth> {
    if (!this.client) {
      return {
        ok: true,
        configured: false,
        details: "S3 storage is not configured"
      };
    }

    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.config.bucket!
        })
      );

      return {
        ok: true,
        configured: true,
        details: "bucket reachable"
      };
    } catch (error) {
      return {
        ok: false,
        configured: true,
        details: error instanceof Error ? error.message : "failed to reach S3 storage"
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

      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket!,
          Key: objectName
        })
      );

      await writeStreamToFile(asNodeReadable(response.Body), resolveWithin(workspacePath, relativePath));
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
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket!,
          Key: `${this.objectPrefix(sessionId)}${relativePath}`,
          Body: createReadStream(resolveWithin(workspacePath, relativePath))
        })
      );

      uploaded.push(relativePath);
    }

    uploaded.sort();
    return uploaded;
  }

  private async listObjectNames(prefix: string) {
    const names: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client!.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket!,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );

      for (const entry of response.Contents ?? []) {
        if (entry.Key && !entry.Key.endsWith("/")) {
          names.push(entry.Key);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    names.sort();
    return names;
  }

  private objectPrefix(sessionId: string) {
    return `${trimSlashes(this.config.sessionPrefix)}/${sessionId}/`;
  }
}

function asNodeReadable(body: unknown) {
  if (!body) {
    throw new Error("S3 object body was empty");
  }

  if (body instanceof Readable) {
    return body;
  }

  if (typeof body === "object" && body !== null && "pipe" in body && typeof body.pipe === "function") {
    return body as Readable;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return Readable.fromWeb(body.transformToWebStream() as WebReadableStream);
  }

  throw new Error("Unsupported S3 object body type");
}

function trimSlashes(value: string) {
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}
