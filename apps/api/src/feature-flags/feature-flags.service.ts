import { createHash } from "node:crypto";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { DEFAULT_FEATURE_FLAGS } from "@neochat/config";
import { eq } from "drizzle-orm";
import type { Database } from "../database/drizzle.js";
import { featureFlags } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";

@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private cache = new Map<string, { enabled: boolean; rolloutPercentage: number }>();

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async onModuleInit(): Promise<void> {
    await this.reload().catch((err) => this.logger.warn(`flags reload skipped: ${String(err)}`));
  }

  async reload(): Promise<void> {
    const rows = await this.db.select().from(featureFlags);
    this.cache.clear();
    for (const row of rows) {
      this.cache.set(row.key, { enabled: row.enabled, rolloutPercentage: row.rolloutPercentage });
    }
  }

  isEnabled(key: string, subjectId?: string): boolean {
    const flag = this.cache.get(key);
    const enabled = flag ? flag.enabled : (DEFAULT_FEATURE_FLAGS[key] ?? false);
    if (!enabled) return false;

    const pct = flag?.rolloutPercentage ?? 100;
    if (pct >= 100) return true;
    if (pct <= 0) return false;

    if (!subjectId) return false;

    const bucket =
      createHash("sha256").update(`${key}:${subjectId}`).digest().readUInt32BE(0) % 100;
    return bucket < pct;
  }

  async list() {
    const rows = await this.db.select().from(featureFlags);
    return rows.map((r) => ({
      key: r.key,
      enabled: r.enabled,
      description: r.description,
      rolloutPercentage: r.rolloutPercentage,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async update(key: string, patch: { enabled?: boolean; rolloutPercentage?: number }) {
    await this.db
      .insert(featureFlags)
      .values({
        key,
        enabled: patch.enabled ?? false,
        rolloutPercentage: patch.rolloutPercentage ?? 100,
      })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { ...patch, updatedAt: new Date() },
      });
    await this.reload();
    return this.cache.get(key);
  }
}
