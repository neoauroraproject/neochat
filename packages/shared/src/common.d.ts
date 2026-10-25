import { z } from "zod";
/** Branded id helpers (UUID v4/v7 as strings). */
export declare const uuid: z.ZodString;
export declare const isoDate: z.ZodString;
export declare const SUPPORTED_LOCALES: readonly ["en", "fa", "ar", "tr", "ru"];
export declare const LocaleSchema: z.ZodEnum<["en", "fa", "ar", "tr", "ru"]>;
export type Locale = z.infer<typeof LocaleSchema>;
export declare const RTL_LOCALES: ReadonlyArray<Locale>;
export declare const PaginationQuerySchema: z.ZodObject<
  {
    limit: z.ZodDefault<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    limit: number;
    cursor?: string | undefined;
  },
  {
    limit?: number | undefined;
    cursor?: string | undefined;
  }
>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export declare const PageSchema: <T extends z.ZodTypeAny>(
  item: T,
) => z.ZodObject<
  {
    items: z.ZodArray<T, "many">;
    nextCursor: z.ZodNullable<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    items: T["_output"][];
    nextCursor: string | null;
  },
  {
    items: T["_input"][];
    nextCursor: string | null;
  }
>;
export declare const ErrorResponseSchema: z.ZodObject<
  {
    statusCode: z.ZodNumber;
    error: z.ZodString;
    message: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    code: z.ZodOptional<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    message: string | string[];
    statusCode: number;
    error: string;
    code?: string | undefined;
  },
  {
    message: string | string[];
    statusCode: number;
    error: string;
    code?: string | undefined;
  }
>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
//# sourceMappingURL=common.d.ts.map
