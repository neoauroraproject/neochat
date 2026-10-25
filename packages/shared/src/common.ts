import { z } from "zod";

/** Branded id helpers (UUID v4/v7 as strings). */
export const uuid = z.string().uuid();
export const isoDate = z.string().datetime({ offset: true });

export const SUPPORTED_LOCALES = ["en", "fa", "ar", "tr", "ru"] as const;
export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

export const RTL_LOCALES: ReadonlyArray<Locale> = ["fa", "ar"];

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const ErrorResponseSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.union([z.string(), z.array(z.string())]),
  code: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
