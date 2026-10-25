import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { StorageProvider } from "@neochat/providers";
import type {
  ConfirmMediaUploadRequest,
  CreateMediaUploadRequest,
  PresignedUpload,
} from "@neochat/shared";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type AuditService } from "../audit/audit.service.js";
import { type ChatMembershipService } from "../chats/chat-membership.service.js";
import { type ConfigurationService } from "../config/configuration.service.js";
import type { Database } from "../database/drizzle.js";
import { mediaObjects } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { STORAGE_PROVIDER } from "../providers/provider.tokens.js";

@Injectable()
export class MediaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly membership: ChatMembershipService,
    private readonly cfg: ConfigurationService,
    private readonly audit: AuditService,
  ) {}

  async createUploadSlot(
    userId: string,
    input: CreateMediaUploadRequest,
  ): Promise<PresignedUpload> {
    await this.membership.requireMember(input.chatId, userId);

    const maxBytes = this.cfg.get("general").maxAttachmentBytes;
    if (input.size > maxBytes) {
      throw new ForbiddenException("Attachment exceeds maximum size");
    }

    const mediaConfig = this.cfg.get("media");
    if (
      !mediaConfig.allowedContentTypes.includes("*/*") &&
      !mediaConfig.allowedContentTypes.includes(input.mimeDeclared)
    ) {
      throw new ForbiddenException("Content type not allowed");
    }

    const objectKey = `media/${input.chatId}/${randomUUID()}`;
    const [row] = await this.db
      .insert(mediaObjects)
      .values({
        chatId: input.chatId,
        uploaderId: userId,
        objectKey,
        size: input.size,
        mimeDeclared: input.mimeDeclared,
        sha256Ciphertext: input.sha256Ciphertext,
        kind: input.kind,
      })
      .returning();

    const presign = await this.storage.presignUpload(
      objectKey,
      input.mimeDeclared,
      mediaConfig.presignExpirySeconds,
    );

    await this.audit.record({
      actorId: userId,
      action: "media.upload_slot",
      targetType: "media",
      targetId: row!.id,
      metadata: { chatId: input.chatId, kind: input.kind },
    });

    return {
      mediaObjectId: row!.id,
      uploadUrl: presign.uploadUrl,
      method: presign.method,
      headers: presign.headers,
      expiresAt: presign.expiresAt.toISOString(),
    };
  }

  async confirm(userId: string, mediaObjectId: string, input: ConfirmMediaUploadRequest) {
    const [row] = await this.db
      .select()
      .from(mediaObjects)
      .where(and(eq(mediaObjects.id, mediaObjectId), eq(mediaObjects.uploaderId, userId)))
      .limit(1);
    if (!row) throw new NotFoundException("Media object not found");
    await this.membership.requireMember(row.chatId, userId);

    const stat = await this.storage.stat(row.objectKey);
    if (!stat || stat.size !== input.size) {
      throw new ForbiddenException("Uploaded object size mismatch");
    }

    await this.db
      .update(mediaObjects)
      .set({ confirmedAt: new Date(), size: input.size })
      .where(eq(mediaObjects.id, mediaObjectId));

    return { ok: true, mediaObjectId };
  }

  async downloadUrl(userId: string, mediaObjectId: string) {
    const [row] = await this.db
      .select()
      .from(mediaObjects)
      .where(eq(mediaObjects.id, mediaObjectId))
      .limit(1);
    if (!row) throw new NotFoundException("Media object not found");
    if (!row.confirmedAt) throw new ForbiddenException("Media upload not confirmed");
    await this.membership.requireMember(row.chatId, userId);

    const presign = await this.storage.presignDownload(
      row.objectKey,
      this.cfg.get("media").presignExpirySeconds,
    );

    return {
      mediaObjectId: row.id,
      downloadUrl: presign.downloadUrl,
      expiresAt: presign.expiresAt.toISOString(),
      mimeDeclared: row.mimeDeclared,
      size: Number(row.size),
      kind: row.kind,
      sha256Ciphertext: row.sha256Ciphertext,
    };
  }
}
