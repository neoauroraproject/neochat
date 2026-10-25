import { z } from "zod";
export declare const HealthCheckComponentSchema: z.ZodObject<
  {
    status: z.ZodEnum<["ok", "degraded", "down"]>;
    detail: z.ZodOptional<z.ZodString>;
    latencyMs: z.ZodOptional<z.ZodNumber>;
  },
  "strip",
  z.ZodTypeAny,
  {
    status: "ok" | "degraded" | "down";
    detail?: string | undefined;
    latencyMs?: number | undefined;
  },
  {
    status: "ok" | "degraded" | "down";
    detail?: string | undefined;
    latencyMs?: number | undefined;
  }
>;
export type HealthCheckComponent = z.infer<typeof HealthCheckComponentSchema>;
export declare const HealthCheckSchema: z.ZodObject<
  {
    status: z.ZodEnum<["ok", "degraded", "down"]>;
    checks: z.ZodRecord<
      z.ZodString,
      z.ZodObject<
        {
          status: z.ZodEnum<["ok", "degraded", "down"]>;
          detail: z.ZodOptional<z.ZodString>;
          latencyMs: z.ZodOptional<z.ZodNumber>;
        },
        "strip",
        z.ZodTypeAny,
        {
          status: "ok" | "degraded" | "down";
          detail?: string | undefined;
          latencyMs?: number | undefined;
        },
        {
          status: "ok" | "degraded" | "down";
          detail?: string | undefined;
          latencyMs?: number | undefined;
        }
      >
    >;
    version: z.ZodString;
    uptimeSeconds: z.ZodNumber;
  },
  "strip",
  z.ZodTypeAny,
  {
    status: "ok" | "degraded" | "down";
    checks: Record<
      string,
      {
        status: "ok" | "degraded" | "down";
        detail?: string | undefined;
        latencyMs?: number | undefined;
      }
    >;
    version: string;
    uptimeSeconds: number;
  },
  {
    status: "ok" | "degraded" | "down";
    checks: Record<
      string,
      {
        status: "ok" | "degraded" | "down";
        detail?: string | undefined;
        latencyMs?: number | undefined;
      }
    >;
    version: string;
    uptimeSeconds: number;
  }
>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
//# sourceMappingURL=health.d.ts.map
