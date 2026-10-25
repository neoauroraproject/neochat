import { test } from "node:test";
import assert from "node:assert/strict";
import { HealthCheckSchema } from "@neochat/shared";

test("health check schema accepts ok status", () => {
  const sample = {
    status: "ok" as const,
    checks: {
      api: { status: "ok" as const, latencyMs: 0 },
      database: { status: "ok" as const, latencyMs: 1 },
    },
    version: "1.0.0-rc.1",
    uptimeSeconds: 42,
  };
  assert.equal(HealthCheckSchema.safeParse(sample).success, true);
});

test("health check schema rejects invalid status", () => {
  const sample = {
    status: "unknown",
    checks: {},
    version: "1.0.0-rc.1",
    uptimeSeconds: 1,
  };
  assert.equal(HealthCheckSchema.safeParse(sample).success, false);
});
