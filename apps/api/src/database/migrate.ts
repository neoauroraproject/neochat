import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnv } from "../config/env.js";
import { createDb, createPgClient } from "./drizzle.js";

async function main() {
  const env = loadEnv();
  const client = createPgClient(env.DATABASE_URL, 1);
  const db = createDb(client);
  console.log("[migrate] applying migrations from ./drizzle …");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] done.");
  await client.end();
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
