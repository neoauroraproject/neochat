import argon2 from "argon2";
import { DEFAULT_FEATURE_FLAGS, defaultConfig } from "@neochat/config";
import { loadEnv } from "../config/env.js";
import { createDb, createPgClient } from "./drizzle.js";
import { configEntries, credentials, featureFlags, users } from "./schema/index.js";

/**
 * Idempotent seed: default feature flags, config categories, and an optional
 * bootstrap admin (only if none exists yet).
 */
async function main() {
  const env = loadEnv();
  const client = createPgClient(env.DATABASE_URL, 1);
  const db = createDb(client);

  console.log("[seed] feature flags …");
  for (const [key, enabled] of Object.entries(DEFAULT_FEATURE_FLAGS) as [string, boolean][]) {
    await db.insert(featureFlags).values({ key, enabled, description: null }).onConflictDoNothing();
  }

  console.log("[seed] config defaults …");
  const cfg = defaultConfig();
  for (const [category, values] of Object.entries(cfg)) {
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      // jsonb NOT NULL — coerce undefined/null to empty string so seed is idempotent
      const stored = value === undefined || value === null ? "" : value;
      await db
        .insert(configEntries)
        .values({ category, key, value: stored as never })
        .onConflictDoNothing();
    }
  }

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length === 0) {
    console.log("[seed] creating bootstrap admin (admin / ChangeMe!2026) …");
    const [admin] = await db
      .insert(users)
      .values({
        username: "admin",
        displayName: "Administrator",
        role: "admin",
        locale: env ? "en" : "en",
      })
      .returning();
    const hash = await argon2.hash("ChangeMe!2026", { type: argon2.argon2id });
    await db.insert(credentials).values({ userId: admin!.id, passwordHash: hash });
  } else {
    console.log("[seed] users already exist, skipping admin creation.");
  }

  console.log("[seed] done.");
  await client.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
