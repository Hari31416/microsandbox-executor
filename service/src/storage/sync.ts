import type { SessionStorage } from "./types.js";

export class WorkspaceSync {
  constructor(private readonly storage: SessionStorage) {}

  async stageFiles(filePaths: string[], workspacePath: string) {
    return this.storage.downloadFiles(filePaths, workspacePath);
  }

  async persistFiles(workspacePath: string, relativePaths: string[]) {
    return this.storage.uploadFiles(workspacePath, relativePaths);
  }
}
