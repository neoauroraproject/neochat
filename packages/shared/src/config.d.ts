import { z } from "zod";
export declare const ConfigEntrySchema: z.ZodObject<
  {
    category: z.ZodString;
    key: z.ZodString;
    value: z.ZodUnknown;
    updatedAt: z.ZodOptional<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    category: string;
    key: string;
    value?: unknown;
    updatedAt?: string | undefined;
  },
  {
    category: string;
    key: string;
    value?: unknown;
    updatedAt?: string | undefined;
  }
>;
export type ConfigEntry = z.infer<typeof ConfigEntrySchema>;
export declare const UpdateConfigRequestSchema: z.ZodObject<
  {
    value: z.ZodUnknown;
  },
  "strip",
  z.ZodTypeAny,
  {
    value?: unknown;
  },
  {
    value?: unknown;
  }
>;
export type UpdateConfigRequest = z.infer<typeof UpdateConfigRequestSchema>;
//# sourceMappingURL=config.d.ts.map
