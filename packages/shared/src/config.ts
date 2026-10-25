import { z } from "zod";
import { isoDate } from "./common.js";

export const ConfigEntrySchema = z.object({
  category: z.string(),
  key: z.string(),
  value: z.unknown(),
  updatedAt: isoDate.optional(),
});
export type ConfigEntry = z.infer<typeof ConfigEntrySchema>;

export const UpdateConfigRequestSchema = z.object({
  value: z.unknown(),
});
export type UpdateConfigRequest = z.infer<typeof UpdateConfigRequestSchema>;
