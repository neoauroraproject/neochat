import { z } from "zod";
import { isoDate } from "./common.js";
export const FeatureFlagSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  description: z.string().nullable(),
  rolloutPercentage: z.number().int().min(0).max(100).default(100),
  updatedAt: isoDate.optional(),
});
export const UpdateFeatureFlagRequestSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
});
//# sourceMappingURL=flags.js.map
