import { z } from "zod";
export declare const InviteSchema: z.ZodObject<
  {
    id: z.ZodString;
    code: z.ZodString;
    createdBy: z.ZodString;
    maxUses: z.ZodNumber;
    uses: z.ZodNumber;
    expiresAt: z.ZodNullable<z.ZodString>;
    revokedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    code: string;
    id: string;
    createdAt: string;
    createdBy: string;
    maxUses: number;
    uses: number;
    expiresAt: string | null;
    revokedAt: string | null;
  },
  {
    code: string;
    id: string;
    createdAt: string;
    createdBy: string;
    maxUses: number;
    uses: number;
    expiresAt: string | null;
    revokedAt: string | null;
  }
>;
export type Invite = z.infer<typeof InviteSchema>;
export declare const CreateInviteRequestSchema: z.ZodObject<
  {
    maxUses: z.ZodDefault<z.ZodNumber>;
    expiresInHours: z.ZodOptional<z.ZodNumber>;
  },
  "strip",
  z.ZodTypeAny,
  {
    maxUses: number;
    expiresInHours?: number | undefined;
  },
  {
    maxUses?: number | undefined;
    expiresInHours?: number | undefined;
  }
>;
export type CreateInviteRequest = z.infer<typeof CreateInviteRequestSchema>;
export declare const AdminUserRowSchema: z.ZodObject<
  {
    id: z.ZodString;
    username: z.ZodString;
    displayName: z.ZodString;
    role: z.ZodEnum<["user", "admin"]>;
    status: z.ZodEnum<["active", "suspended", "deleted"]>;
    locale: z.ZodEnum<["en", "fa", "ar", "tr", "ru"]>;
    createdAt: z.ZodString;
    lastSeenAt: z.ZodNullable<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    status: "active" | "suspended" | "deleted";
    username: string;
    displayName: string;
    locale: "en" | "fa" | "ar" | "tr" | "ru";
    role: "user" | "admin";
    id: string;
    createdAt: string;
    lastSeenAt: string | null;
  },
  {
    status: "active" | "suspended" | "deleted";
    username: string;
    displayName: string;
    locale: "en" | "fa" | "ar" | "tr" | "ru";
    role: "user" | "admin";
    id: string;
    createdAt: string;
    lastSeenAt: string | null;
  }
>;
export type AdminUserRow = z.infer<typeof AdminUserRowSchema>;
export declare const UpdateUserAdminRequestSchema: z.ZodObject<
  {
    role: z.ZodOptional<z.ZodEnum<["user", "admin"]>>;
    status: z.ZodOptional<z.ZodEnum<["active", "suspended", "deleted"]>>;
  },
  "strip",
  z.ZodTypeAny,
  {
    status?: "active" | "suspended" | "deleted" | undefined;
    role?: "user" | "admin" | undefined;
  },
  {
    status?: "active" | "suspended" | "deleted" | undefined;
    role?: "user" | "admin" | undefined;
  }
>;
export type UpdateUserAdminRequest = z.infer<typeof UpdateUserAdminRequestSchema>;
export declare const AuditLogEntrySchema: z.ZodObject<
  {
    id: z.ZodString;
    actorId: z.ZodNullable<z.ZodString>;
    action: z.ZodString;
    targetType: z.ZodNullable<z.ZodString>;
    targetId: z.ZodNullable<z.ZodString>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    ip: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
    createdAt: string;
    actorId: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    ip: string | null;
  },
  {
    id: string;
    createdAt: string;
    actorId: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    ip: string | null;
  }
>;
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
export declare const RetentionPolicySchema: z.ZodObject<
  {
    id: z.ZodString;
    scope: z.ZodEnum<["messages", "media", "audit"]>;
    chatType: z.ZodDefault<z.ZodEnum<["dm", "group", "channel", "all"]>>;
    maxAgeDays: z.ZodNullable<z.ZodNumber>;
    enabled: z.ZodBoolean;
    updatedAt: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    id: string;
    scope: "messages" | "media" | "audit";
    chatType: "dm" | "group" | "channel" | "all";
    maxAgeDays: number | null;
    enabled: boolean;
    updatedAt: string;
  },
  {
    id: string;
    scope: "messages" | "media" | "audit";
    maxAgeDays: number | null;
    enabled: boolean;
    updatedAt: string;
    chatType?: "dm" | "group" | "channel" | "all" | undefined;
  }
>;
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;
export declare const UpsertRetentionPolicyRequestSchema: z.ZodObject<
  Pick<
    {
      id: z.ZodString;
      scope: z.ZodEnum<["messages", "media", "audit"]>;
      chatType: z.ZodDefault<z.ZodEnum<["dm", "group", "channel", "all"]>>;
      maxAgeDays: z.ZodNullable<z.ZodNumber>;
      enabled: z.ZodBoolean;
      updatedAt: z.ZodString;
    },
    "scope" | "chatType" | "maxAgeDays" | "enabled"
  >,
  "strip",
  z.ZodTypeAny,
  {
    scope: "messages" | "media" | "audit";
    chatType: "dm" | "group" | "channel" | "all";
    maxAgeDays: number | null;
    enabled: boolean;
  },
  {
    scope: "messages" | "media" | "audit";
    maxAgeDays: number | null;
    enabled: boolean;
    chatType?: "dm" | "group" | "channel" | "all" | undefined;
  }
>;
export type UpsertRetentionPolicyRequest = z.infer<typeof UpsertRetentionPolicyRequestSchema>;
export declare const TlsConfigSchema: z.ZodObject<
  {
    mode: z.ZodEnum<["off", "caddy-auto", "custom-cert"]>;
    domain: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    certPath: z.ZodNullable<z.ZodString>;
    keyPath: z.ZodNullable<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    mode: "off" | "caddy-auto" | "custom-cert";
    domain: string | null;
    email: string | null;
    certPath: string | null;
    keyPath: string | null;
    updatedAt?: string | undefined;
  },
  {
    mode: "off" | "caddy-auto" | "custom-cert";
    domain: string | null;
    email: string | null;
    certPath: string | null;
    keyPath: string | null;
    updatedAt?: string | undefined;
  }
>;
export type TlsConfig = z.infer<typeof TlsConfigSchema>;
export declare const UpdateTlsConfigRequestSchema: z.ZodObject<
  Omit<
    {
      mode: z.ZodEnum<["off", "caddy-auto", "custom-cert"]>;
      domain: z.ZodNullable<z.ZodString>;
      email: z.ZodNullable<z.ZodString>;
      certPath: z.ZodNullable<z.ZodString>;
      keyPath: z.ZodNullable<z.ZodString>;
      updatedAt: z.ZodOptional<z.ZodString>;
    },
    "updatedAt"
  >,
  "strip",
  z.ZodTypeAny,
  {
    mode: "off" | "caddy-auto" | "custom-cert";
    domain: string | null;
    email: string | null;
    certPath: string | null;
    keyPath: string | null;
  },
  {
    mode: "off" | "caddy-auto" | "custom-cert";
    domain: string | null;
    email: string | null;
    certPath: string | null;
    keyPath: string | null;
  }
>;
export type UpdateTlsConfigRequest = z.infer<typeof UpdateTlsConfigRequestSchema>;
//# sourceMappingURL=admin.d.ts.map
