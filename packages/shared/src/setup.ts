import { z } from "zod";
import { LocaleSchema, uuid, isoDate } from "./common.js";

/** First-run setup wizard. Creates initial admin + instance settings. */
export const SetupRequestSchema = z.object({
  instanceName: z.string().min(1).max(120),
  admin: z.object({
    username: z.string().min(3).max(32),
    password: z.string().min(10).max(256),
    displayName: z.string().min(1).max(120),
  }),
  defaultLocale: LocaleSchema.default("en"),
  allowOpenRegistration: z.boolean().default(false),
  http: z
    .object({
      host: z.string().min(1).default("0.0.0.0"),
      port: z.number().int().positive().default(8085),
    })
    .optional(),
  storage: z
    .object({
      driver: z.enum(["local", "minio", "s3", "memory"]).default("memory"),
      path: z.string().min(1).default("./data/media"),
      bucket: z.string().min(1).default("neochat-media"),
    })
    .optional(),
});
export type SetupRequest = z.infer<typeof SetupRequestSchema>;

export const SetupStatusSchema = z.object({
  needsSetup: z.boolean(),
  instanceName: z.string().nullable(),
});
export type SetupStatus = z.infer<typeof SetupStatusSchema>;
