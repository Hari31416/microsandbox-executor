import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import type { AppConfig } from "../config.js";
import { normalizeRelativePath, resolveWithin, writeStreamToFile } from "../util/fs.js";
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

  async downloadFiles(filePaths: string[], workspacePath: string) {
    if (!this.client || filePaths.length === 0) {
      return [];
    }

    const downloadedFiles: string[] = [];
    const normalizedPaths = [...new Set(filePaths.map((filePath) => normalizeRelativePath(filePath)))].sort();

    for (const objectName of normalizedPaths) {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket!,
          Key: objectName
        })
      );

      await writeStreamToFile(asNodeReadable(response.Body), resolveWithin(workspacePath, objectName));
      downloadedFiles.push(objectName);
    }

    downloadedFiles.sort();
    return downloadedFiles;
  }

  async uploadFiles(workspacePath: string, relativePaths: string[]) {
    if (!this.client || relativePaths.length === 0) {
      return [];
    }

    const uploaded: string[] = [];

    for (const relativePath of relativePaths) {
      const objectKey = normalizeRelativePath(relativePath);

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket!,
          Key: objectKey,
          Body: createReadStream(resolveWithin(workspacePath, objectKey))
        })
      );

      uploaded.push(objectKey);
    }

    uploaded.sort();
    return uploaded;
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
