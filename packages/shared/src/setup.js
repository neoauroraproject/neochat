import { z } from "zod";
import { LocaleSchema } from "./common.js";
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
});
export const SetupStatusSchema = z.object({
  needsSetup: z.boolean(),
  instanceName: z.string().nullable(),
});
//# sourceMappingURL=setup.js.map
