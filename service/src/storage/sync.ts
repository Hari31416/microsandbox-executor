import { MinioSessionStorage } from "./minio.js";

export class WorkspaceSync {
  constructor(private readonly storage: MinioSessionStorage) {}

  async hydrateSession(sessionId: string, workspacePath: string) {
    return this.storage.downloadSession(sessionId, workspacePath);
  }

  async persistFiles(sessionId: string, workspacePath: string, relativePaths: string[]) {
    return this.storage.uploadFiles(sessionId, workspacePath, relativePaths);
  }
}
