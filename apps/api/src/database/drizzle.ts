import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Database = PostgresJsDatabase<typeof schema>;

export function createPgClient(databaseUrl: string, max = 10) {
  return postgres(databaseUrl, { max, prepare: false });
}

export function createDb(client: ReturnType<typeof createPgClient>): Database {
  return drizzle(client, { schema });
}

export { schema };
