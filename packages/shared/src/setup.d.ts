import { z } from "zod";
/** First-run setup wizard. Creates initial admin + instance settings. */
export declare const SetupRequestSchema: z.ZodObject<
  {
    instanceName: z.ZodString;
    admin: z.ZodObject<
      {
        username: z.ZodString;
        password: z.ZodString;
        displayName: z.ZodString;
      },
      "strip",
      z.ZodTypeAny,
      {
        username: string;
        password: string;
        displayName: string;
      },
      {
        username: string;
        password: string;
        displayName: string;
      }
    >;
    defaultLocale: z.ZodDefault<z.ZodEnum<["en", "fa", "ar", "tr", "ru"]>>;
    allowOpenRegistration: z.ZodDefault<z.ZodBoolean>;
  },
  "strip",
  z.ZodTypeAny,
  {
    admin: {
      username: string;
      password: string;
      displayName: string;
    };
    instanceName: string;
    defaultLocale: "en" | "fa" | "ar" | "tr" | "ru";
    allowOpenRegistration: boolean;
  },
  {
    admin: {
      username: string;
      password: string;
      displayName: string;
    };
    instanceName: string;
    defaultLocale?: "en" | "fa" | "ar" | "tr" | "ru" | undefined;
    allowOpenRegistration?: boolean | undefined;
  }
>;
export type SetupRequest = z.infer<typeof SetupRequestSchema>;
export declare const SetupStatusSchema: z.ZodObject<
  {
    needsSetup: z.ZodBoolean;
    instanceName: z.ZodNullable<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    instanceName: string | null;
    needsSetup: boolean;
  },
  {
    instanceName: string | null;
    needsSetup: boolean;
  }
>;
export type SetupStatus = z.infer<typeof SetupStatusSchema>;
//# sourceMappingURL=setup.d.ts.map
