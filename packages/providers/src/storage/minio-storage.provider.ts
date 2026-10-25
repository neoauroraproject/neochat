import * as Minio from "minio";
import type { HealthCheckResult } from "../health.js";
import type {
  PresignedDownloadResult,
  PresignedUploadResult,
  StorageProvider,
} from "./storage.provider.js";

export interface MinioStorageConfig {
  endpoint: string;
  port: number;
  useSsl: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
}

export class MinioStorageProvider implements StorageProvider {
  readonly name = "minio";
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(config: MinioStorageConfig) {
    this.bucket = config.bucket;
    this.region = config.region;
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSsl,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket, this.region);
    }
  }

  async health(): Promise<HealthCheckResult> {
    const t0 = Date.now();
    try {
      await this.client.bucketExists(this.bucket);
      return { status: "ok", latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        status: "down",
        latencyMs: Date.now() - t0,
        detail: String((err as Error).message ?? err),
      };
    }
  }

  async presignUpload(
    objectKey: string,
    contentType: string,
    expirySeconds: number,
  ): Promise<PresignedUploadResult> {
    const uploadUrl = await this.client.presignedPutObject(this.bucket, objectKey, expirySeconds);
    return {
      uploadUrl,
      method: "PUT",
      headers: { "content-type": contentType },
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
      objectKey,
      bucket: this.bucket,
    };
  }

  async presignDownload(
    objectKey: string,
    expirySeconds: number,
  ): Promise<PresignedDownloadResult> {
    const downloadUrl = await this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);
    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + expirySeconds * 1000),
    };
  }

  async remove(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }

  async stat(objectKey: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const result = await this.client.statObject(this.bucket, objectKey);
      return {
        size: result.size,
        contentType: result.metaData["content-type"] ?? "application/octet-stream",
      };
    } catch {
      return null;
    }
  }
}
