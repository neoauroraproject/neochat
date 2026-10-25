import { z } from "zod";
import { isoDate, uuid } from "./common.js";

export const BackupEntrySchema = z.object({
  id: z.string(),
  filename: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: isoDate,
  status: z.enum(["completed", "failed", "in_progress"]),
  includesMessages: z.boolean(),
  detail: z.string().optional(),
});
export type BackupEntry = z.infer<typeof BackupEntrySchema>;

export const CreateBackupRequestSchema = z.object({
  includeDatabase: z.boolean().default(true),
  label: z.string().max(120).optional(),
});
export type CreateBackupRequest = z.infer<typeof CreateBackupRequestSchema>;

export const RestoreBackupRequestSchema = z.object({
  backupId: z.string().min(1),
  confirm: z.literal(true),
});
export type RestoreBackupRequest = z.infer<typeof RestoreBackupRequestSchema>;

export const BackupScheduleSchema = z.object({
  enabled: z.boolean(),
  cronExpression: z.string().default("0 3 * * *"),
  retentionCount: z.number().int().positive().max(365).default(14),
});
export type BackupSchedule = z.infer<typeof BackupScheduleSchema>;

export const UpdateBackupScheduleRequestSchema = BackupScheduleSchema;
export type UpdateBackupScheduleRequest = z.infer<typeof UpdateBackupScheduleRequestSchema>;
