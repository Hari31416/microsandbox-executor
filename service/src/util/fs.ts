import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, normalize, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export async function removeDirIfExists(path: string) {
  await rm(path, { recursive: true, force: true });
}

export function normalizeRelativePath(value: string) {
  const normalized = normalize(value).replaceAll("\\", "/");

  if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Path must stay inside the workspace: ${value}`);
  }

  return normalized;
}

export function resolveWithin(root: string, relativePath: string) {
  const safeRelativePath = normalizeRelativePath(relativePath);
  const resolved = resolve(root, safeRelativePath);
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;

  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Resolved path escaped workspace root: ${relativePath}`);
  }

  return resolved;
}

export async function writeStreamToFile(stream: NodeJS.ReadableStream, destinationPath: string) {
  await ensureDir(dirname(destinationPath));
  await pipeline(stream, createWriteStream(destinationPath));
}
