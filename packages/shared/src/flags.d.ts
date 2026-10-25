import { z } from "zod";
export declare const FeatureFlagSchema: z.ZodObject<
  {
    key: z.ZodString;
    enabled: z.ZodBoolean;
    description: z.ZodNullable<z.ZodString>;
    rolloutPercentage: z.ZodDefault<z.ZodNumber>;
    updatedAt: z.ZodOptional<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    enabled: boolean;
    key: string;
    description: string | null;
    rolloutPercentage: number;
    updatedAt?: string | undefined;
  },
  {
    enabled: boolean;
    key: string;
    description: string | null;
    updatedAt?: string | undefined;
    rolloutPercentage?: number | undefined;
  }
>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export declare const UpdateFeatureFlagRequestSchema: z.ZodObject<
  {
    enabled: z.ZodOptional<z.ZodBoolean>;
    rolloutPercentage: z.ZodOptional<z.ZodNumber>;
  },
  "strip",
  z.ZodTypeAny,
  {
    enabled?: boolean | undefined;
    rolloutPercentage?: number | undefined;
  },
  {
    enabled?: boolean | undefined;
    rolloutPercentage?: number | undefined;
  }
>;
export type UpdateFeatureFlagRequest = z.infer<typeof UpdateFeatureFlagRequestSchema>;
//# sourceMappingURL=flags.d.ts.map
