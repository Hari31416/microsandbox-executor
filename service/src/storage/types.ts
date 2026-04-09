export interface StorageHealth {
  ok: boolean;
  configured: boolean;
  details: string;
}

export interface SessionStorage {
  healthCheck(): Promise<StorageHealth>;
  downloadSession(sessionId: string, workspacePath: string): Promise<string[]>;
  uploadFiles(sessionId: string, workspacePath: string, relativePaths: string[]): Promise<string[]>;
}
