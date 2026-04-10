export interface StorageHealth {
  ok: boolean;
  configured: boolean;
  details: string;
}

export interface UploadSpec {
  localPath: string;
  objectKey: string;
}

export interface SessionStorage {
  healthCheck(): Promise<StorageHealth>;
  downloadFiles(filePaths: string[], workspacePath: string): Promise<string[]>;
  uploadFiles(workspacePath: string, uploads: UploadSpec[]): Promise<string[]>;
}
