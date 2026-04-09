import {
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import type { DemoConfig } from "./config.js";

export class DemoStorage {
  private readonly client: S3Client;

  constructor(private readonly config: DemoConfig["s3"]) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async healthCheck() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    return { ok: true };
  }

  async uploadObject(key: string, body: Buffer, contentType?: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType
      })
    );
  }

  async downloadObject(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      })
    );

    return {
      body: asNodeReadable(response.Body),
      contentType: response.ContentType ?? "application/octet-stream"
    };
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
