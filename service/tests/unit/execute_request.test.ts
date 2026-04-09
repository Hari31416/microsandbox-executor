import test from "node:test";
import assert from "node:assert/strict";

import { executeRequestSchema } from "../../src/jobs/models.js";

test("executeRequestSchema accepts bucket-relative file paths", () => {
  const parsed = executeRequestSchema.parse({
    session_id: "sess_123",
    file_paths: ["inputs/example.txt", "nested/data.csv"],
    code: "print('hello')"
  });

  assert.deepEqual(parsed.filePaths, ["inputs/example.txt", "nested/data.csv"]);
});

test("executeRequestSchema rejects unsafe file paths", () => {
  const result = executeRequestSchema.safeParse({
    session_id: "sess_123",
    file_paths: ["../secret.txt"],
    code: "print('hello')"
  });

  assert.equal(result.success, false);
});
