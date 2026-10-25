import { statfsSync } from "node:fs";
import os from "node:os";
import { Inject, Injectable } from "@nestjs/common";
import type { CallProvider } from "@neochat/providers";
import { type Redis } from "ioredis";
import { sql } from "drizzle-orm";
import type { StorageProvider } from "@neochat/providers";
import type { HealthCheck } from "@neochat/shared";
import type { Database } from "../database/drizzle.js";
import { DRIZZLE } from "../database/tokens.js";
import { type ConfigurationService } from "../config/configuration.service.js";
import { type JobTrackerService } from "../jobs/job-tracker.service.js";
import { type PluginLoaderService } from "../plugin-loader/plugin-loader.service.js";
import { CALL_PROVIDER, STORAGE_PROVIDER } from "../providers/provider.tokens.js";
import { REDIS } from "../redis/redis.module.js";
import { APP_STARTED_AT, APP_VERSION } from "../system/system.service.js";
import { validateCertFile } from "../tls/tls-validation.js";

type CheckStatus = "ok" | "degraded" | "down";
type CheckResult = { status: CheckStatus; latencyMs?: number; detail?: string };

@Injectable()
export class HealthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(CALL_PROVIDER) private readonly calls: CallProvider,
    private readonly cfg: ConfigurationService,
    private readonly plugins: PluginLoaderService,
    private readonly jobs: JobTrackerService,
  ) {}

  live(): { status: "ok"; version: string; uptimeSeconds: number } {
    return {
      status: "ok",
      version: APP_VERSION,
      uptimeSeconds: (Date.now() - APP_STARTED_AT) / 1000,
    };
  }

  async ready(): Promise<HealthCheck> {
    const diagnostics = await this.diagnostics();
    const critical = ["database", "redis"] as const;
    const down = critical.some((key) => diagnostics.checks[key]?.status === "down");
    return {
      status: down ? "down" : diagnostics.status,
      checks: {
        database: diagnostics.checks.database!,
        redis: diagnostics.checks.redis!,
        api: diagnostics.checks.api!,
      },
      version: APP_VERSION,
      uptimeSeconds: (Date.now() - APP_STARTED_AT) / 1000,
    };
  }

  async diagnostics(): Promise<HealthCheck> {
    const checks: HealthCheck["checks"] = {};

    checks.api = { status: "ok", latencyMs: 0, detail: "API process running" };

    checks.database = await this.timed(async () => {
      await this.db.execute(sql`select 1`);
    });

    checks.redis = await this.timed(async () => {
      if (this.redis.status !== "ready") await this.redis.connect().catch(() => this.redis.ping());
      await this.redis.ping();
    });

    if (this.storage) {
      checks.storage = await this.timed(async () => {
        await this.storage.ensureBucket();
      });
      if (this.storage.name === "noop") {
        checks.storage = {
          status: "degraded",
          latencyMs: checks.storage.latencyMs ?? 0,
          detail: "Storage provider is noop (foundation stub)",
        };
      }
    }

    checks.disk = this.checkDisk();
    checks.memory = this.checkMemory();
    checks.cpu = this.checkCpu();
    checks.jobs = await this.checkJobs();
    checks.certificates = this.checkCertificates();
    checks.plugins = this.checkPlugins();
    checks.calls = await this.checkCalls();

    const statuses = Object.values(checks).map((c) => c!.status);
    const status: CheckStatus = statuses.includes("down")
      ? "down"
      : statuses.includes("degraded")
        ? "degraded"
        : "ok";

    return {
      status,
      checks,
      version: APP_VERSION,
      uptimeSeconds: (Date.now() - APP_STARTED_AT) / 1000,
    };
  }

  private checkDisk(): CheckResult {
    const t0 = Date.now();
    try {
      const stats = statfsSync(process.cwd());
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bavail;
      const usedPct =
        totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0;
      const status: CheckStatus = usedPct >= 95 ? "down" : usedPct >= 85 ? "degraded" : "ok";
      return {
        status,
        latencyMs: Date.now() - t0,
        detail: `${usedPct}% used (${Math.round(freeBytes / 1_048_576)} MiB free)`,
      };
    } catch (err) {
      return {
        status: "degraded",
        latencyMs: Date.now() - t0,
        detail: String((err as Error).message ?? err),
      };
    }
  }

  private checkMemory(): CheckResult {
    const t0 = Date.now();
    const usage = process.memoryUsage();
    const heapUsedMb = Math.round(usage.heapUsed / 1_048_576);
    const rssMb = Math.round(usage.rss / 1_048_576);
    const status: CheckStatus = heapUsedMb >= 1024 ? "degraded" : "ok";
    return {
      status,
      latencyMs: Date.now() - t0,
      detail: `heap ${heapUsedMb} MiB, rss ${rssMb} MiB`,
    };
  }

  private checkCpu(): CheckResult {
    const t0 = Date.now();
    const [load1 = 0] = os.loadavg();
    const cores = os.cpus().length || 1;
    const normalized = load1 / cores;
    const status: CheckStatus = normalized >= 1 ? "degraded" : "ok";
    return {
      status,
      latencyMs: Date.now() - t0,
      detail: `load1 ${load1.toFixed(2)} (${cores} cores)`,
    };
  }

  private checkCertificates(): CheckResult {
    const tls = this.cfg.get("tls");
    const mode = tls.mode as string;
    if (mode === "off") {
      return { status: "degraded", latencyMs: 0, detail: "TLS disabled" };
    }
    if (mode === "caddy-auto") {
      const domain = tls.domain as string | null;
      if (!domain) {
        return {
          status: "degraded",
          latencyMs: 0,
          detail: "Caddy auto TLS selected but domain not set",
        };
      }
      return { status: "ok", latencyMs: 0, detail: `Caddy auto TLS configured for ${domain}` };
    }
    if (mode === "custom-cert") {
      const certPath = tls.certPath as string | null;
      if (!certPath || !tls.keyPath || !tls.domain) {
        return { status: "degraded", latencyMs: 0, detail: "Custom cert mode incomplete" };
      }
      const validation = validateCertFile(certPath);
      if (!validation?.valid) {
        return {
          status: "degraded",
          latencyMs: 0,
          detail: validation?.errors?.join("; ") ?? "Certificate validation failed",
        };
      }
      return {
        status: (validation.daysUntilExpiry ?? 999) <= 7 ? "degraded" : "ok",
        latencyMs: 0,
        detail: `Custom cert for ${tls.domain}, expires in ${validation.daysUntilExpiry} day(s)`,
      };
    }
    return { status: "degraded", latencyMs: 0, detail: `Unknown TLS mode: ${mode}` };
  }

  private async checkCalls(): Promise<CheckResult> {
    const t0 = Date.now();
    try {
      const result = await this.calls.health();
      return {
        status: result.status,
        latencyMs: result.latencyMs ?? Date.now() - t0,
        detail: result.detail ?? `${this.calls.name} provider`,
      };
    } catch (err) {
      return {
        status: "down",
        latencyMs: Date.now() - t0,
        detail: String((err as Error).message ?? err),
      };
    }
  }

  private async checkJobs(): Promise<CheckResult> {
    const records = await this.jobs.list(["retention.sweep", "backup.scheduled", "backup.manual"]);
    const failed = records.filter((r) => r.lastStatus === "failed");
    const detail = records
      .map((r) => `${r.name}: ${r.lastStatus}${r.lastRunAt ? ` @ ${r.lastRunAt}` : ""}`)
      .join("; ");
    return {
      status: failed.length ? "degraded" : "ok",
      latencyMs: 0,
      detail: detail || "No background jobs recorded yet",
    };
  }

  private checkPlugins(): CheckResult {
    const state = this.plugins.getState();
    return {
      status: state.ready ? "ok" : "down",
      latencyMs: 0,
      detail: state.ready
        ? `Plugin host ready (${state.pluginCount} plugins)`
        : "Plugin host not ready",
    };
  }

  private async timed(fn: () => Promise<void>): Promise<CheckResult> {
    const t0 = Date.now();
    try {
      await fn();
      return { status: "ok", latencyMs: Date.now() - t0 };
    } catch (err) {
      return {
        status: "down",
        latencyMs: Date.now() - t0,
        detail: String((err as Error).message ?? err),
      };
    }
  }
}
