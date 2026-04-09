import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../../src/config.js";

test("loadConfig uses generic S3-compatible storage settings", () => {
  const config = loadConfig({
    S3_ENDPOINT: "http://localhost:9000",
    S3_BUCKET: "executor-sessions",
    S3_ACCESS_KEY_ID: "minioadmin",
    S3_SECRET_ACCESS_KEY: "minioadmin"
  });

  assert.equal(config.s3.configured, true);
  assert.equal(config.s3.endpoint, "http://localhost:9000");
  assert.equal(config.s3.region, "us-east-1");
  assert.equal(config.s3.bucket, "executor-sessions");
  assert.equal(config.s3.forcePathStyle, true);
  assert.equal(config.runtimeImages.default, "python:3.12");
  assert.equal(config.runtimeImages["data-science"], "amancevice/pandas:latest");
  assert.equal(config.enableRestrictedExec, false);
  assert.deepEqual(config.blockedImports, ["subprocess", "socket", "multiprocessing", "resource", "pty"]);
});
