import { z } from "zod";
import { uuid, isoDate, LocaleSchema } from "./common.js";
import { UserRoleSchema, UserStatusSchema } from "./user.js";
export const InviteSchema = z.object({
  id: uuid,
  code: z.string(),
  createdBy: uuid,
  maxUses: z.number().int().positive(),
  uses: z.number().int().nonnegative(),
  expiresAt: isoDate.nullable(),
  revokedAt: isoDate.nullable(),
  createdAt: isoDate,
});
export const CreateInviteRequestSchema = z.object({
  maxUses: z.number().int().positive().max(10000).default(1),
  expiresInHours: z.number().int().positive().max(8760).optional(),
});
export const AdminUserRowSchema = z.object({
  id: uuid,
  username: z.string(),
  displayName: z.string(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  locale: LocaleSchema,
  createdAt: isoDate,
  lastSeenAt: isoDate.nullable(),
});
export const UpdateUserAdminRequestSchema = z.object({
  role: UserRoleSchema.optional(),
  status: UserStatusSchema.optional(),
});
export const AuditLogEntrySchema = z.object({
  id: uuid,
  actorId: uuid.nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: isoDate,
});
export const RetentionPolicySchema = z.object({
  id: uuid,
  scope: z.enum(["messages", "media", "audit"]),
  chatType: z.enum(["dm", "group", "channel", "all"]).default("all"),
  maxAgeDays: z.number().int().positive().nullable(),
  enabled: z.boolean(),
  updatedAt: isoDate,
});
export const UpsertRetentionPolicyRequestSchema = RetentionPolicySchema.pick({
  scope: true,
  chatType: true,
  maxAgeDays: true,
  enabled: true,
});
export const TlsConfigSchema = z.object({
  mode: z.enum(["off", "caddy-auto", "custom-cert"]),
  domain: z.string().nullable(),
  email: z.string().email().nullable(),
  certPath: z.string().nullable(),
  keyPath: z.string().nullable(),
  updatedAt: isoDate.optional(),
});
export const UpdateTlsConfigRequestSchema = TlsConfigSchema.omit({
  updatedAt: true,
});
//# sourceMappingURL=admin.js.map
