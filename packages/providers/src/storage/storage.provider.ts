import type { HealthCheckResult } from "../health.js";

export interface PresignedUploadResult {
  uploadUrl: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresAt: Date;
  objectKey: string;
  bucket: string;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

/** Abstraction over object storage backends. */
export interface StorageProvider {
  readonly name: string;
  ensureBucket(): Promise<void>;
  health(): Promise<HealthCheckResult>;
  presignUpload(
    objectKey: string,
    contentType: string,
    expirySeconds: number,
  ): Promise<PresignedUploadResult>;
  presignDownload(objectKey: string, expirySeconds: number): Promise<PresignedDownloadResult>;
  remove(objectKey: string): Promise<void>;
  stat(objectKey: string): Promise<{ size: number; contentType: string } | null>;
}

/** Phase 2 noop adapter — storage operations are no-ops until MinIO wiring is enabled. */
export class NoopStorageProvider implements StorageProvider {
  readonly name = "noop";

  async ensureBucket(): Promise<void> {}

  async health(): Promise<HealthCheckResult> {
    return {
      status: "degraded",
      latencyMs: 0,
      detail: "Storage provider is noop (foundation stub)",
    };
  }

  async presignUpload(
    objectKey: string,
    contentType: string,
    expirySeconds: number,
  ): Promise<PresignedUploadResult> {
    return {
      uploadUrl: `noop://upload/${objectKey}`,
      method: "PUT",
      headers: { "content-type": contentType },
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
      objectKey,
      bucket: "noop",
    };
  }

  async presignDownload(
    objectKey: string,
    expirySeconds: number,
  ): Promise<PresignedDownloadResult> {
    return {
      downloadUrl: `noop://download/${objectKey}`,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  }

  async remove(_objectKey: string): Promise<void> {}

  async stat(_objectKey: string): Promise<{ size: number; contentType: string } | null> {
    return null;
  }
}
