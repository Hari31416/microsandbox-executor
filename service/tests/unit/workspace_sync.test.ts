import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

import { WorkspaceSync } from "../../src/storage/sync.js";
import type { SessionStorage, StorageHealth, UploadSpec } from "../../src/storage/types.js";

class FakeStorage implements SessionStorage {
  uploadedFiles: UploadSpec[] = [];

  async healthCheck(): Promise<StorageHealth> {
    return {
      ok: true,
      configured: true,
      details: "ok"
    };
  }

  async downloadFiles(filePaths: string[], workspacePath: string): Promise<string[]> {
    for (const filePath of filePaths) {
      const absolutePath = join(workspacePath, filePath);
      await mkdir(join(absolutePath, ".."), { recursive: true });
      await writeFile(absolutePath, `contents:${filePath}`, "utf8");
    }

    return filePaths;
  }

  async uploadFiles(_workspacePath: string, uploads: UploadSpec[]): Promise<string[]> {
    this.uploadedFiles = uploads;
    return uploads.map((upload) => upload.objectKey);
  }
}

test("WorkspaceSync stages unique top-level aliases for nested files", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "workspace-sync-"));
  const sync = new WorkspaceSync(new FakeStorage());

  await sync.stageFiles(["demo/sess-1/inputs/titanic.csv"], workspacePath);

  const aliasStats = await lstat(join(workspacePath, "titanic.csv"));
  assert.equal(aliasStats.isSymbolicLink(), true);
  assert.equal(await readlink(join(workspacePath, "titanic.csv")), "demo/sess-1/inputs/titanic.csv");
  assert.equal(await readFile(join(workspacePath, "titanic.csv"), "utf8"), "contents:demo/sess-1/inputs/titanic.csv");
});

test("WorkspaceSync skips aliases when nested files share the same basename", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "workspace-sync-"));
  const sync = new WorkspaceSync(new FakeStorage());

  await sync.stageFiles(
    ["demo/sess-1/inputs/titanic.csv", "demo/sess-1/archive/titanic.csv"],
    workspacePath
  );

  await assert.rejects(() => lstat(join(workspacePath, "titanic.csv")), { code: "ENOENT" });
});

test("WorkspaceSync persists new root-level files under the session outputs prefix", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "workspace-sync-"));
  const storage = new FakeStorage();
  const sync = new WorkspaceSync(storage);

  await sync.persistFiles(
    workspacePath,
    "demo-sess-1",
    ["demo/demo-sess-1/inputs/titanic.csv"],
    ["titanic_cleaned.csv", "reports/daily.csv"]
  );

  assert.deepEqual(storage.uploadedFiles, [
    {
      localPath: "titanic_cleaned.csv",
      objectKey: "demo/demo-sess-1/outputs/titanic_cleaned.csv"
    },
    {
      localPath: "reports/daily.csv",
      objectKey: "demo/demo-sess-1/outputs/reports/daily.csv"
    }
  ]);
});

test("WorkspaceSync keeps original object keys for modified staged files", async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), "workspace-sync-"));
  const storage = new FakeStorage();
  const sync = new WorkspaceSync(storage);

  await sync.persistFiles(
    workspacePath,
    "demo-sess-1",
    ["demo/demo-sess-1/inputs/titanic.csv"],
    ["demo/demo-sess-1/inputs/titanic.csv"]
  );

  assert.deepEqual(storage.uploadedFiles, [
    {
      localPath: "demo/demo-sess-1/inputs/titanic.csv",
      objectKey: "demo/demo-sess-1/inputs/titanic.csv"
    }
  ]);
});
