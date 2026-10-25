import { z } from "zod";

export const HealthCheckComponentSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  detail: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type HealthCheckComponent = z.infer<typeof HealthCheckComponentSchema>;

export const HealthCheckSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  checks: z.record(HealthCheckComponentSchema),
  version: z.string(),
  uptimeSeconds: z.number(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
