import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { StorageProvider } from "@neochat/providers";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type {
  AdminUserRow,
  PublicUser,
  UpdateProfileRequest,
  UpdateUserAdminRequest,
  UserProfile,
} from "@neochat/shared";
import { type ConfigurationService } from "../config/configuration.service.js";
import type { Database } from "../database/drizzle.js";
import { devices, refreshTokens, sessions, users } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { type PresenceService } from "../presence/presence.service.js";
import { STORAGE_PROVIDER } from "../providers/provider.tokens.js";

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly cfg: ConfigurationService,
    private readonly presence: PresenceService,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!row) throw new NotFoundException("User not found");
    const online = await this.presence.isOnline(userId);
    return this.toProfile(row, online);
  }

  async updateProfile(userId: string, patch: UpdateProfileRequest): Promise<UserProfile> {
    const [row] = await this.db
      .update(users)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new NotFoundException("User not found");
    const online = await this.presence.isOnline(userId);
    return this.toProfile(row, online);
  }

  async createAvatarUploadSlot(userId: string) {
    const objectKey = `avatars/${userId}/${randomUUID()}`;
    const presign = await this.storage.presignUpload(
      objectKey,
      "image/*",
      this.cfg.get("media").presignExpirySeconds,
    );
    return {
      objectKey,
      uploadUrl: presign.uploadUrl,
      method: presign.method,
      headers: presign.headers,
      expiresAt: presign.expiresAt.toISOString(),
      avatarUrl: `${this.cfg.env.PUBLIC_API_URL}/api/v1/media/avatars/${encodeURIComponent(objectKey)}`,
    };
  }

  async search(term: string, excludeUserId: string, limit = 20): Promise<PublicUser[]> {
    const rows = await this.db
      .select()
      .from(users)
      .where(
        and(
          ne(users.id, excludeUserId),
          eq(users.status, "active"),
          sql`(${users.username} ILIKE ${"%" + term + "%"} OR ${users.displayName} ILIKE ${"%" + term + "%"})`,
        ),
      )
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      bio: r.bio,
    }));
  }

  async listDevices(userId: string, currentDeviceId?: string) {
    const rows = await this.db.select().from(devices).where(eq(devices.userId, userId));
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      publicKey: d.publicKey,
      lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
      current: d.id === currentDeviceId,
    }));
  }

  async revokeDevice(userId: string, deviceId: string): Promise<{ ok: true }> {
    const [device] = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1);
    if (!device) throw new NotFoundException("Device not found");

    const sessionRows = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.deviceId, deviceId));
    const sessionIds = sessionRows.map((s) => s.id);
    if (sessionIds.length > 0) {
      const now = new Date();
      await this.db.update(sessions).set({ revokedAt: now }).where(eq(sessions.deviceId, deviceId));
      for (const sessionId of sessionIds) {
        await this.db
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(eq(refreshTokens.sessionId, sessionId));
      }
    }

    await this.db.delete(devices).where(eq(devices.id, deviceId));
    return { ok: true };
  }

  async listForAdmin(limit = 500): Promise<AdminUserRow[]> {
    const rows = await this.db.select().from(users).orderBy(desc(users.createdAt)).limit(limit);
    return rows.map((r) => this.toAdminRow(r));
  }

  async updateForAdmin(userId: string, patch: UpdateUserAdminRequest): Promise<AdminUserRow> {
    const [row] = await this.db
      .update(users)
      .set({
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    if (!row) throw new NotFoundException("User not found");
    return this.toAdminRow(row);
  }

  async revokeAllSessionsForAdmin(userId: string): Promise<{ revoked: number }> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new NotFoundException("User not found");

    const now = new Date();
    const activeSessions = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

    for (const session of activeSessions) {
      await this.db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, session.id));
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(eq(refreshTokens.sessionId, session.id));
    }

    return { revoked: activeSessions.length };
  }
  private toAdminRow(row: typeof users.$inferSelect): AdminUserRow {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role as AdminUserRow["role"],
      status: row.status as AdminUserRow["status"],
      locale: row.locale as AdminUserRow["locale"],
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    };
  }

  private toProfile(row: typeof users.$inferSelect, online = false): UserProfile {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      role: row.role as UserProfile["role"],
      status: row.status as UserProfile["status"],
      locale: row.locale as UserProfile["locale"],
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      online,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
