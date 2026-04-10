import { lstat, symlink } from "node:fs/promises";
import { posix } from "node:path";

import { normalizeRelativePath, resolveWithin } from "../util/fs.js";
import type { SessionStorage } from "./types.js";

export class WorkspaceSync {
  constructor(private readonly storage: SessionStorage) {}

  async stageFiles(filePaths: string[], workspacePath: string) {
    const downloadedFiles = await this.storage.downloadFiles(filePaths, workspacePath);
    await createWorkspaceAliases(downloadedFiles, workspacePath);
    return downloadedFiles;
  }

  async persistFiles(workspacePath: string, sessionId: string, stagedFilePaths: string[], relativePaths: string[]) {
    const uploads = buildUploadSpecs(sessionId, stagedFilePaths, relativePaths);
    return this.storage.uploadFiles(workspacePath, uploads);
  }
}

async function createWorkspaceAliases(filePaths: string[], workspacePath: string) {
  const normalizedPaths = [...new Set(filePaths.map((filePath) => normalizeRelativePath(filePath)))];
  const basenameCounts = new Map<string, number>();

  for (const filePath of normalizedPaths) {
    const basename = posix.basename(filePath);
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
  }

  for (const filePath of normalizedPaths) {
    const basename = posix.basename(filePath);

    if (basename === filePath || basenameCounts.get(basename) !== 1) {
      continue;
    }

    const aliasPath = resolveWithin(workspacePath, basename);

    if (await pathExists(aliasPath)) {
      continue;
    }

    await symlink(filePath, aliasPath);
  }
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function buildUploadSpecs(sessionId: string, stagedFilePaths: string[], relativePaths: string[]) {
  const normalizedExistingPaths = new Set(stagedFilePaths.map((filePath) => normalizeRelativePath(filePath)));
  const outputPrefix = inferOutputPrefix(sessionId, stagedFilePaths);

  return relativePaths.map((relativePath) => {
    const normalizedPath = normalizeRelativePath(relativePath);

    return {
      localPath: normalizedPath,
      objectKey: normalizedExistingPaths.has(normalizedPath) ? normalizedPath : posix.join(outputPrefix, normalizedPath)
    };
  });
}

function inferOutputPrefix(sessionId: string, stagedFilePaths: string[]) {
  for (const filePath of stagedFilePaths) {
    const normalizedPath = normalizeRelativePath(filePath);
    const sessionMarker = `/${sessionId}/`;
    const markerIndex = normalizedPath.indexOf(sessionMarker);

    if (markerIndex >= 0) {
      return posix.join(normalizedPath.slice(0, markerIndex + sessionMarker.length - 1), "outputs");
    }

    if (normalizedPath.endsWith(`/${sessionId}`)) {
      return posix.join(normalizedPath, "outputs");
    }
  }

  return posix.join(sessionId, "outputs");
}
