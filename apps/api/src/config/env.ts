import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { parseBootstrapEnv, type BootstrapEnv } from "@neochat/config";

let cached: BootstrapEnv | null = null;

function resolveEnvPaths(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/api/src/config -> repo root is ../../../../
  const repoRoot = resolve(here, "../../../../");
  const apiRoot = resolve(here, "../../");
  return [resolve(repoRoot, ".env"), resolve(apiRoot, ".env"), resolve(process.cwd(), ".env")];
}

/**
 * Loads and validates the bootstrap environment. This is the ONLY place
 * process.env is read. Everything else consumes typed config via the
 * Configuration Service.
 */
export function loadEnv(): BootstrapEnv {
  if (cached) return cached;
  for (const path of resolveEnvPaths()) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false });
      break;
    }
  }
  loadDotenv({ override: false });
  cached = parseBootstrapEnv(process.env);
  return cached;
}

export const BOOTSTRAP_ENV = Symbol("BOOTSTRAP_ENV");
