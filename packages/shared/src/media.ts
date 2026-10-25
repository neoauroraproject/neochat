import { z } from "zod";
import { isoDate, uuid } from "./common.js";

export const MediaKindSchema = z.enum(["image", "file", "video", "voice"]);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const MediaObjectSchema = z.object({
  id: uuid,
  chatId: uuid,
  uploaderId: uuid,
  objectKey: z.string(),
  size: z.number().int().nonnegative(),
  mimeDeclared: z.string(),
  sha256Ciphertext: z.string(),
  kind: MediaKindSchema,
  confirmedAt: isoDate.nullable().optional(),
  createdAt: isoDate,
});
export type MediaObject = z.infer<typeof MediaObjectSchema>;

export const CreateUploadRequestSchema = z.object({
  chatId: uuid,
  kind: MediaKindSchema,
  mimeDeclared: z.string().min(1).max(120),
  size: z.number().int().positive(),
  sha256Ciphertext: z.string().min(1).max(128),
  fileName: z.string().max(255).optional(),
});
export type CreateUploadRequest = z.infer<typeof CreateUploadRequestSchema>;

/** Alias retained for API modules importing the legacy name. */
export const CreateMediaUploadRequestSchema = CreateUploadRequestSchema;
export type CreateMediaUploadRequest = CreateUploadRequest;

export const PresignedUploadSchema = z.object({
  mediaObjectId: uuid,
  uploadUrl: z.string().url(),
  method: z.enum(["PUT", "POST"]).default("PUT"),
  headers: z.record(z.string()),
  expiresAt: isoDate.optional(),
});
export type PresignedUpload = z.infer<typeof PresignedUploadSchema>;

export const ConfirmUploadRequestSchema = z.object({
  size: z.number().int().positive(),
  etag: z.string().optional(),
});
export type ConfirmUploadRequest = z.infer<typeof ConfirmUploadRequestSchema>;

/** Alias retained for API modules importing the legacy name. */
export const ConfirmMediaUploadRequestSchema = ConfirmUploadRequestSchema;
export type ConfirmMediaUploadRequest = ConfirmUploadRequest;

export const ConfirmUploadResponseSchema = z.object({
  ok: z.literal(true),
  mediaObjectId: uuid,
});
export type ConfirmUploadResponse = z.infer<typeof ConfirmUploadResponseSchema>;

export const DownloadInfoSchema = z.object({
  mediaObjectId: uuid,
  downloadUrl: z.string().url(),
  expiresAt: isoDate,
  mimeDeclared: z.string(),
  size: z.number().int().nonnegative(),
  kind: MediaKindSchema,
  sha256Ciphertext: z.string(),
});
export type DownloadInfo = z.infer<typeof DownloadInfoSchema>;
