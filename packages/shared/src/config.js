import { z } from "zod";
import { isoDate } from "./common.js";
export const ConfigEntrySchema = z.object({
  category: z.string(),
  key: z.string(),
  value: z.unknown(),
  updatedAt: isoDate.optional(),
});
export const UpdateConfigRequestSchema = z.object({
  value: z.unknown(),
});
//# sourceMappingURL=config.js.map
