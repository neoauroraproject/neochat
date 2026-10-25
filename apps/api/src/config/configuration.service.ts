import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
  CONFIG_CATEGORIES,
  defaultConfig,
  type BootstrapEnv,
  type ConfigCategory,
  type ConfigShape,
} from "@neochat/config";
import { eq } from "drizzle-orm";
import type { Database } from "../database/drizzle.js";
import { configEntries } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { loadEnv } from "./env.js";

/**
 * Central Configuration Service.
 *
 * Layered resolution: DB `config_entries` overrides schema defaults. The
 * bootstrap env (`env`) is exposed read-only for infra concerns. Feature
 * modules MUST depend on this service instead of reading process.env.
 */
@Injectable()
export class ConfigurationService implements OnModuleInit {
  private readonly logger = new Logger(ConfigurationService.name);
  readonly env: BootstrapEnv;
  private cache: ConfigShape = defaultConfig();

  constructor(@Inject(DRIZZLE) private readonly db: Database) {
    this.env = loadEnv();
  }

  async onModuleInit(): Promise<void> {
    await this.reload().catch((err) => {
      this.logger.warn(`config reload skipped (db not ready?): ${String(err)}`);
    });
  }

  /** Reload the full config cache from the database. */
  async reload(): Promise<void> {
    const rows = await this.db.select().from(configEntries);
    const next = defaultConfig();
    for (const row of rows) {
      const category = row.category as ConfigCategory;
      if (!(category in next)) continue;
      (next[category] as Record<string, unknown>)[row.key] = row.value;
    }
    // Validate each category, falling back to defaults on parse failure.
    for (const category of Object.keys(CONFIG_CATEGORIES) as ConfigCategory[]) {
      const parsed = CONFIG_CATEGORIES[category].safeParse(next[category]);
      if (parsed.success) {
        (this.cache as Record<string, unknown>)[category] = parsed.data;
      } else {
        this.logger.warn(`config category '${category}' invalid; using defaults`);
      }
    }
  }

  get<C extends ConfigCategory>(category: C): ConfigShape[C] {
    return this.cache[category];
  }

  async set<C extends ConfigCategory>(category: C, key: string, value: unknown): Promise<void> {
    await this.db
      .insert(configEntries)
      .values({ category, key, value: value as never })
      .onConflictDoUpdate({
        target: [configEntries.category, configEntries.key],
        set: { value: value as never, updatedAt: new Date() },
      });
    await this.reload();
  }

  async list(category?: ConfigCategory) {
    const rows = await this.db.select().from(configEntries);
    return category ? rows.filter((r) => r.category === category) : rows;
  }

  async getSystemSetting<T>(key: string): Promise<T | null> {
    const rows = await this.db
      .select()
      .from(configEntries)
      .where(eq(configEntries.category, "__system"));
    const found = rows.find((r) => r.key === key);
    return found ? (found.value as T) : null;
  }
}
