export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthCheckResult {
  status: HealthStatus;
  detail?: string;
  latencyMs?: number;
}
