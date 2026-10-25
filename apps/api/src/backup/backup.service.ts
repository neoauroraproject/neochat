import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import type {
  BackupEntry,
  CreateBackupRequest,
  UpdateBackupScheduleRequest,
} from "@neochat/shared";
import { sql } from "drizzle-orm";
import { type AuditService } from "../audit/audit.service.js";
import { type ConfigurationService } from "../config/configuration.service.js";
import type { Database } from "../database/drizzle.js";
import { DRIZZLE } from "../database/tokens.js";

interface BackupManifest {
  id: string;
  createdAt: string;
  includeDatabase: boolean;
  includesMessages: boolean;
  label?: string;
  note: string;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cfg: ConfigurationService,
    private readonly audit: AuditService,
  ) {}

  private backupRoot(): string {
    return this.cfg.get("backup").backupDir;
  }

  async create(input: CreateBackupRequest, actorId?: string, ip?: string): Promise<BackupEntry> {
    const id = `backup-${Date.now()}`;
    const root = this.backupRoot();
    mkdirSync(root, { recursive: true });
    const workDir = join(root, id);
    mkdirSync(workDir, { recursive: true });

    const manifest: BackupManifest = {
      id,
      createdAt: new Date().toISOString(),
      includeDatabase: input.includeDatabase,
      includesMessages: false,
      label: input.label,
      note: "Message payloads are stored as ciphertext only. Plaintext is never exported.",
    };

    writeFileSync(join(workDir, "config.json"), JSON.stringify(this.exportConfig(), null, 2));

    if (input.includeDatabase) {
      await this.exportDatabase(workDir);
    }

    writeFileSync(
      join(workDir, "README.txt"),
      [
        "NeoChat backup",
        "================",
        "",
        "Included:",
        "  - config.json (runtime configuration categories)",
        input.includeDatabase
          ? "  - postgres.sql or critical-tables.sql"
          : "  - (no database dump)",
        "",
        "NOT included:",
        "  - MinIO/S3 media objects (mirror separately with mc mirror)",
        "  - Redis ephemeral state",
        "",
        "Messages: only ciphertext columns are present in SQL exports.",
        "Restore requires matching JWT secrets from the original instance.",
      ].join("\n"),
    );

    writeFileSync(join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    const archivePath = join(root, `${id}.tar.gz`);
    await this.createTarGz(workDir, archivePath);
    rmSync(workDir, { recursive: true, force: true });

    await this.pruneOldBackups();
    if (actorId) {
      await this.audit.record({
        actorId,
        action: "admin.backup.create",
        targetType: "backup",
        targetId: id,
        ip,
      });
    }

    const stat = statSync(archivePath);
    return {
      id,
      filename: basename(archivePath),
      sizeBytes: stat.size,
      createdAt: manifest.createdAt,
      status: "completed",
      includesMessages: false,
      detail: manifest.note,
    };
  }

  list(): BackupEntry[] {
    const root = this.backupRoot();
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .filter((f) => f.endsWith(".tar.gz"))
      .map((filename) => {
        const id = filename.replace(/\.tar\.gz$/, "");
        const stat = statSync(join(root, filename));
        return {
          id,
          filename,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
          status: "completed" as const,
          includesMessages: false,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async restore(backupId: string, actorId: string, ip?: string): Promise<{ ok: true }> {
    const archivePath = join(this.backupRoot(), `${backupId}.tar.gz`);
    if (!existsSync(archivePath)) throw new NotFoundException("Backup not found");

    const sqlPath = await this.extractSqlFromArchive(archivePath);
    const sqlContent = readFileSync(sqlPath, "utf8");
    await this.db.execute(sql.raw(sqlContent));
    rmSync(join(this.backupRoot(), ".restore-tmp"), { recursive: true, force: true });

    await this.audit.record({
      actorId,
      action: "admin.backup.restore",
      targetType: "backup",
      targetId: backupId,
      ip,
    });
    return { ok: true };
  }

  getSchedule(): UpdateBackupScheduleRequest {
    const backup = this.cfg.get("backup");
    return {
      enabled: backup.scheduleEnabled,
      cronExpression: backup.cronExpression,
      retentionCount: backup.retentionCount,
    };
  }

  async updateSchedule(input: UpdateBackupScheduleRequest, actorId: string, ip?: string) {
    await this.cfg.set("backup", "scheduleEnabled", input.enabled);
    await this.cfg.set("backup", "cronExpression", input.cronExpression);
    await this.cfg.set("backup", "retentionCount", input.retentionCount);
    await this.audit.record({
      actorId,
      action: "admin.backup.schedule",
      targetType: "config",
      targetId: "backup.schedule",
      metadata: input,
      ip,
    });
    return this.getSchedule();
  }

  private exportConfig(): Record<string, unknown> {
    return {
      general: this.cfg.get("general"),
      security: this.cfg.get("security"),
      media: this.cfg.get("media"),
      calls: this.cfg.get("calls"),
      notifications: this.cfg.get("notifications"),
      retention: this.cfg.get("retention"),
      https: this.cfg.get("https"),
      tls: this.cfg.get("tls"),
      storage: this.cfg.get("storage"),
      backup: this.cfg.get("backup"),
    };
  }

  private async exportDatabase(workDir: string): Promise<void> {
    const dbUrl = this.cfg.env.DATABASE_URL;
    const outPath = join(workDir, "postgres.sql");
    try {
      await this.runPgDump(dbUrl, outPath);
    } catch (err) {
      this.logger.warn(
        `pg_dump unavailable (${String(err)}); falling back to critical tables export`,
      );
      await this.exportCriticalTables(join(workDir, "critical-tables.sql"));
    }
  }

  private runPgDump(databaseUrl: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("pg_dump", ["--no-owner", "--no-acl", databaseUrl], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const out = createWriteStream(outPath);
      child.stdout.pipe(out);
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `pg_dump exited ${code}`));
      });
    });
  }

  private async exportCriticalTables(outPath: string): Promise<void> {
    const lines: string[] = [
      "-- NeoChat critical tables export (ciphertext messages only, no plaintext)",
      "BEGIN;",
    ];
    const tables = [
      "users",
      "credentials",
      "devices",
      "config_entries",
      "feature_flags",
      "retention_policies",
      "invites",
    ];
    for (const table of tables) {
      const rows = await this.db.execute(sql.raw(`SELECT * FROM ${table}`));
      lines.push(`-- table ${table}`);
      for (const row of rows as unknown as Record<string, unknown>[]) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => this.sqlLiteral(row[c]));
        lines.push(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING;`,
        );
      }
    }
    lines.push("COMMIT;");
    writeFileSync(outPath, lines.join("\n"));
  }

  private sqlLiteral(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  private async createTarGz(sourceDir: string, archivePath: string): Promise<void> {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const parent = join(sourceDir, "..");
    await execFileAsync("tar", ["-czf", archivePath, "-C", parent, basename(sourceDir)]);
  }

  private async extractSqlFromArchive(archivePath: string): Promise<string> {
    const tmp = join(this.backupRoot(), ".restore-tmp");
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    await promisify(execFile)("tar", ["-xzf", archivePath, "-C", tmp]);
    const dirs = readdirSync(tmp);
    const inner = join(tmp, dirs[0]!);
    const candidate = ["postgres.sql", "critical-tables.sql"]
      .map((f) => join(inner, f))
      .find((p) => existsSync(p));
    if (!candidate) throw new NotFoundException("No SQL dump found in backup archive");
    return candidate;
  }

  private async pruneOldBackups(): Promise<void> {
    const retention = this.cfg.get("backup").retentionCount;
    const entries = this.list();
    for (const entry of entries.slice(retention)) {
      try {
        rmSync(join(this.backupRoot(), entry.filename));
      } catch (err) {
        this.logger.warn(`Failed to prune backup ${entry.id}: ${String(err)}`);
      }
    }
  }
}
