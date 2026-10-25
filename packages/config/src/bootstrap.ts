import { z } from "zod";

/**
 * Zod's z.coerce.boolean() treats the string "false" as true (Boolean("false") === true).
 * Parse env-style booleans correctly.
 */
const envBoolean = z.preprocess((val) => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const normalized = val.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return val;
}, z.boolean());

/**
 * Bootstrap env schema. This is the ONLY place environment variables are read
 * and validated. Feature modules receive typed config from the Configuration
 * Service instead of touching process.env.
 */
export const BootstrapEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEOCHAT_INSTANCE_NAME: z.string().default("NeoChat"),

  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
  PUBLIC_ADMIN_URL: z.string().url().default("http://localhost:5174"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_PEPPER: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  ARGON2_MEMORY_COST: z.coerce.number().int().positive().default(19_456),
  ARGON2_TIME_COST: z.coerce.number().int().positive().default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().positive().default(1),

  STORAGE_PROVIDER: z.enum(["minio", "s3", "memory"]).default("minio"),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: envBoolean.default(false),
  MINIO_ACCESS_KEY: z.string().default("neochat"),
  MINIO_SECRET_KEY: z.string().default("neochat-secret"),
  MINIO_BUCKET: z.string().default("neochat-media"),
  MINIO_REGION: z.string().default("us-east-1"),

  CALL_PROVIDER: z.enum(["livekit", "none"]).default("livekit"),
  LIVEKIT_URL: z.string().default("ws://localhost:7880"),
  LIVEKIT_API_KEY: z.string().default("devkey"),
  LIVEKIT_API_SECRET: z.string().default("devsecret"),

  NOTIFY_PROVIDER: z.enum(["webpush", "none"]).default("webpush"),
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),

  SEARCH_PROVIDER: z.enum(["postgres", "none"]).default("postgres"),

  ALLOW_FIRST_RUN_SETUP: envBoolean.default(true),

  RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(120),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type BootstrapEnv = z.infer<typeof BootstrapEnvSchema>;

export function parseBootstrapEnv(source: Record<string, string | undefined>): BootstrapEnv {
  const parsed = BootstrapEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
