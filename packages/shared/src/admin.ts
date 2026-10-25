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
export type Invite = z.infer<typeof InviteSchema>;

export const CreateInviteRequestSchema = z.object({
  maxUses: z.number().int().positive().max(10000).default(1),
  expiresInHours: z.number().int().positive().max(8760).optional(),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;

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
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>;

export const UpdateUserAdminRequestSchema = z.object({
  role: UserRoleSchema.optional(),
  status: UserStatusSchema.optional(),
});
export type UpdateUserAdminRequest = z.infer<typeof UpdateUserAdminRequestSchema>;

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
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const RetentionPolicySchema = z.object({
  id: uuid,
  scope: z.enum(["messages", "media", "audit"]),
  chatType: z.enum(["dm", "group", "channel", "all"]).default("all"),
  maxAgeDays: z.number().int().positive().nullable(),
  enabled: z.boolean(),
  updatedAt: isoDate,
});
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

export const UpsertRetentionPolicyRequestSchema = RetentionPolicySchema.pick({
  scope: true,
  chatType: true,
  maxAgeDays: true,
  enabled: true,
});
export type UpsertRetentionPolicyRequest = z.infer<typeof UpsertRetentionPolicyRequestSchema>;

export const HttpsConfigAdminSchema = z.object({
  redirectHttp: z.boolean(),
  hstsMaxAgeSeconds: z.number().int().nonnegative(),
});
export type HttpsConfigAdmin = z.infer<typeof HttpsConfigAdminSchema>;

export const TlsCertValidationSchema = z.object({
  valid: z.boolean(),
  subject: z.string().optional(),
  issuer: z.string().optional(),
  notBefore: isoDate.optional(),
  notAfter: isoDate.optional(),
  daysUntilExpiry: z.number().int().optional(),
  errors: z.array(z.string()).optional(),
});
export type TlsCertValidation = z.infer<typeof TlsCertValidationSchema>;

export const TlsConfigSchema = z.object({
  mode: z.enum(["off", "caddy-auto", "custom-cert"]),
  domain: z.string().nullable(),
  email: z.string().email().nullable(),
  certPath: z.string().nullable(),
  keyPath: z.string().nullable(),
  updatedAt: isoDate.optional(),
});
export type TlsConfig = z.infer<typeof TlsConfigSchema>;

export const UpdateTlsConfigRequestSchema = TlsConfigSchema.omit({
  updatedAt: true,
}).extend({
  certPem: z.string().optional(),
  keyPem: z.string().optional(),
  https: HttpsConfigAdminSchema.partial().optional(),
});
export type UpdateTlsConfigRequest = z.infer<typeof UpdateTlsConfigRequestSchema>;

export const TlsConfigResponseSchema = z.object({
  tls: TlsConfigSchema,
  https: HttpsConfigAdminSchema,
  updatedAt: isoDate,
  caddyfileHint: z.string(),
  reverseProxy: z.object({
    stage: z.enum(["gateway", "caddy"]),
    notes: z.array(z.string()),
    verificationChecklist: z.array(z.string()),
  }),
  certValidation: TlsCertValidationSchema.optional(),
  dnsHints: z.array(z.string()).optional(),
  portHints: z.array(z.string()).optional(),
});
export type TlsConfigResponse = z.infer<typeof TlsConfigResponseSchema>;

export const PERMISSION_TEMPLATES = {
  user: {
    label: "User",
    description: "Standard messaging, media, and calls access.",
    permissions: ["messages.send", "messages.read", "media.upload", "calls.join"],
  },
  admin: {
    label: "Server admin",
    description: "Full instance administration via the admin panel.",
    permissions: ["admin.*", "users.manage", "config.manage", "audit.read"],
  },
} as const;

export type PermissionTemplateKey = keyof typeof PERMISSION_TEMPLATES;
