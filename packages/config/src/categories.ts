import { z } from "zod";
import { LocaleSchema } from "./locale.js";

/**
 * Runtime configuration categories. Each category is stored in the DB
 * (`config_entries`) and served by the Configuration Service. Defaults here
 * are used when no DB override exists.
 */

export const GeneralConfigSchema = z.object({
  instanceName: z.string().default("NeoChat"),
  defaultLocale: LocaleSchema.default("en"),
  allowOpenRegistration: z.boolean().default(false),
  maxAttachmentBytes: z.number().int().positive().default(104_857_600),
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().default("NeoChat is undergoing scheduled maintenance."),
  disabledPlugins: z.array(z.string()).default([]),
});
export type GeneralConfig = z.infer<typeof GeneralConfigSchema>;

export const SecurityConfigSchema = z.object({
  sessionIdleTimeoutMinutes: z.number().int().positive().default(43_200),
  maxDevicesPerUser: z.number().int().positive().default(10),
  requireInviteToRegister: z.boolean().default(true),
  passwordMinLength: z.number().int().min(8).default(10),
  loginMaxAttempts: z.number().int().positive().default(5),
  loginLockoutMinutes: z.number().int().positive().default(15),
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export const MediaConfigSchema = z.object({
  presignExpirySeconds: z.number().int().positive().default(900),
  allowedContentTypes: z.array(z.string()).default(["*/*"]),
});
export type MediaConfig = z.infer<typeof MediaConfigSchema>;

export const CallsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxParticipants: z.number().int().positive().default(50),
  tokenTtlSeconds: z.number().int().positive().default(3600),
});
export type CallsConfig = z.infer<typeof CallsConfigSchema>;

export const NotificationsConfigSchema = z.object({
  webPushEnabled: z.boolean().default(true),
});
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

export const RetentionConfigSchema = z.object({
  sweepIntervalMinutes: z.number().int().positive().default(60),
});
export type RetentionConfig = z.infer<typeof RetentionConfigSchema>;

export const HttpsConfigSchema = z.object({
  redirectHttp: z.boolean().default(true),
  hstsMaxAgeSeconds: z.number().int().nonnegative().default(31_536_000),
});
export type HttpsConfig = z.infer<typeof HttpsConfigSchema>;

export const TlsConfigSchema = z.object({
  mode: z.enum(["off", "caddy-auto", "custom-cert"]).default("off"),
  domain: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  certPath: z.string().nullable().default(null),
  keyPath: z.string().nullable().default(null),
});
export type TlsConfig = z.infer<typeof TlsConfigSchema>;

export const HttpConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().int().positive().default(8085),
});
export type HttpConfig = z.infer<typeof HttpConfigSchema>;

export const StorageConfigSchema = z.object({
  driver: z.enum(["local", "minio", "s3", "memory"]).default("memory"),
  path: z.string().default("./data/media"),
  bucket: z.string().default("neochat-media"),
});
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

export const BackupConfigSchema = z.object({
  scheduleEnabled: z.boolean().default(false),
  cronExpression: z.string().default("0 3 * * *"),
  retentionCount: z.number().int().positive().default(14),
  backupDir: z.string().default("./data/backups"),
});
export type BackupConfig = z.infer<typeof BackupConfigSchema>;

/** Registry of all config categories with their schemas. */
export const CONFIG_CATEGORIES = {
  general: GeneralConfigSchema,
  security: SecurityConfigSchema,
  media: MediaConfigSchema,
  calls: CallsConfigSchema,
  notifications: NotificationsConfigSchema,
  retention: RetentionConfigSchema,
  https: HttpsConfigSchema,
  tls: TlsConfigSchema,
  http: HttpConfigSchema,
  storage: StorageConfigSchema,
  backup: BackupConfigSchema,
} as const;

export type ConfigCategory = keyof typeof CONFIG_CATEGORIES;

export type ConfigShape = {
  [K in ConfigCategory]: z.infer<(typeof CONFIG_CATEGORIES)[K]>;
};

export function defaultConfig(): ConfigShape {
  return {
    general: GeneralConfigSchema.parse({}),
    security: SecurityConfigSchema.parse({}),
    media: MediaConfigSchema.parse({}),
    calls: CallsConfigSchema.parse({}),
    notifications: NotificationsConfigSchema.parse({}),
    retention: RetentionConfigSchema.parse({}),
    https: HttpsConfigSchema.parse({}),
    tls: TlsConfigSchema.parse({}),
    http: HttpConfigSchema.parse({}),
    storage: StorageConfigSchema.parse({}),
    backup: BackupConfigSchema.parse({}),
  };
}
