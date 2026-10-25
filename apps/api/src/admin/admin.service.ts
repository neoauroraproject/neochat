import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ConfigCategory, ConfigShape } from "@neochat/config";
import type {
  CreateInviteRequest,
  TlsCertValidation,
  UpdateTlsConfigRequest,
} from "@neochat/shared";
import { PERMISSION_TEMPLATES } from "@neochat/shared";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { type AuditService } from "../audit/audit.service.js";
import { type ConfigurationService } from "../config/configuration.service.js";
import type { Database } from "../database/drizzle.js";
import { invites } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { type FeatureFlagsService } from "../feature-flags/feature-flags.service.js";
import {
  persistTlsPemFiles,
  validateCertFile,
  validateCertificatePem,
} from "../tls/tls-validation.js";

@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly cfg: ConfigurationService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
  ) {}

  listConfig(): Omit<ConfigShape, "http" | "storage">;
  listConfig(
    category?: ConfigCategory,
  ): ConfigShape[ConfigCategory] | Omit<ConfigShape, "http" | "storage">;
  listConfig(category?: ConfigCategory) {
    if (category) return this.cfg.get(category);
    return {
      general: this.cfg.get("general"),
      security: this.cfg.get("security"),
      media: this.cfg.get("media"),
      calls: this.cfg.get("calls"),
      notifications: this.cfg.get("notifications"),
      retention: this.cfg.get("retention"),
      https: this.cfg.get("https"),
      tls: this.cfg.get("tls"),
      backup: this.cfg.get("backup"),
    };
  }

  async patchConfig(
    category: ConfigCategory,
    key: string,
    value: unknown,
    actorId: string,
    ip?: string,
  ) {
    await this.cfg.set(category, key, value);
    await this.audit.record({
      actorId,
      action: "admin.config.update",
      targetType: "config",
      targetId: `${category}.${key}`,
      metadata: { value },
      ip,
    });
    return this.cfg.get(category);
  }

  listFeatureFlags() {
    return this.flags.list();
  }

  async patchFeatureFlag(
    key: string,
    patch: { enabled?: boolean; rolloutPercentage?: number },
    actorId: string,
    ip?: string,
  ) {
    const updated = await this.flags.update(key, patch);
    await this.audit.record({
      actorId,
      action: "admin.feature_flag.update",
      targetType: "feature_flag",
      targetId: key,
      metadata: patch,
      ip,
    });
    return updated;
  }

  listAudit(limit?: number) {
    return this.audit.list(limit);
  }

  async createInvite(input: CreateInviteRequest, actorId: string, ip?: string) {
    const expiresAt = input.expiresInHours
      ? new Date(Date.now() + input.expiresInHours * 3_600_000)
      : null;
    const [row] = await this.db
      .insert(invites)
      .values({
        code: nanoid(12),
        createdBy: actorId,
        maxUses: input.maxUses,
        expiresAt,
      })
      .returning();

    await this.audit.record({
      actorId,
      action: "admin.invite.create",
      targetType: "invite",
      targetId: row!.id,
      ip,
    });

    return this.toInvite(row!);
  }

  async listInvites() {
    const rows = await this.db.select().from(invites).orderBy(desc(invites.createdAt));
    return rows.map((r) => this.toInvite(r));
  }

  async revokeInvite(id: string, actorId: string, ip?: string) {
    const [row] = await this.db.select().from(invites).where(eq(invites.id, id)).limit(1);
    if (!row) throw new NotFoundException("Invite not found");
    if (row.revokedAt) throw new BadRequestException("Invite already revoked");

    const [updated] = await this.db
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(eq(invites.id, id))
      .returning();

    await this.audit.record({
      actorId,
      action: "admin.invite.revoke",
      targetType: "invite",
      targetId: id,
      ip,
    });

    return this.toInvite(updated!);
  }

  getTlsConfig() {
    const tls = this.cfg.get("tls");
    const https = this.cfg.get("https");
    const certValidation = this.resolveCertValidation(tls);
    return {
      tls: { ...tls, updatedAt: new Date().toISOString() },
      https,
      updatedAt: new Date().toISOString(),
      caddyfileHint: this.buildCaddyfileHint(tls, https),
      reverseProxy: this.buildReverseProxyDocs(tls),
      certValidation,
      dnsHints: this.buildDnsHints(tls),
      portHints: this.buildPortHints(https),
    };
  }

  async updateTlsConfig(input: UpdateTlsConfigRequest, actorId: string, ip?: string) {
    const { certPem, keyPem, https, ...tlsPatch } = input;

    if (tlsPatch.mode === "custom-cert" && certPem && keyPem) {
      const validation = validateCertificatePem(certPem, keyPem);
      if (!validation.valid) {
        throw new BadRequestException({
          message: "Invalid certificate or key",
          certValidation: validation,
        });
      }
      const domain = tlsPatch.domain ?? this.cfg.get("tls").domain ?? "neochat.local";
      const paths = persistTlsPemFiles("./data/certs", domain, certPem, keyPem);
      tlsPatch.certPath = paths.certPath;
      tlsPatch.keyPath = paths.keyPath;
    }

    if (tlsPatch.mode === "caddy-auto" && tlsPatch.email && !tlsPatch.email.includes("@")) {
      throw new BadRequestException("ACME email must be a valid email address");
    }

    for (const [key, value] of Object.entries(tlsPatch)) {
      if (value !== undefined) await this.cfg.set("tls", key, value);
    }

    if (https) {
      for (const [key, value] of Object.entries(https)) {
        if (value !== undefined) await this.cfg.set("https", key, value);
      }
    }

    await this.audit.record({
      actorId,
      action: "admin.tls.update",
      targetType: "tls",
      metadata: { ...tlsPatch, https } as Record<string, unknown>,
      ip,
    });

    return this.getTlsConfig();
  }

  getPermissionTemplates() {
    return PERMISSION_TEMPLATES;
  }

  getMaintenance() {
    const general = this.cfg.get("general");
    return {
      maintenanceMode: general.maintenanceMode,
      maintenanceMessage: general.maintenanceMessage,
    };
  }

  async setMaintenanceMode(enabled: boolean, actorId: string, ip?: string) {
    await this.cfg.set("general", "maintenanceMode", enabled);
    await this.audit.record({
      actorId,
      action: enabled ? "admin.maintenance.enable" : "admin.maintenance.disable",
      targetType: "system",
      ip,
    });
    return {
      maintenanceMode: this.cfg.get("general").maintenanceMode,
      maintenanceMessage: this.cfg.get("general").maintenanceMessage,
    };
  }

  private resolveCertValidation(
    tls: ReturnType<ConfigurationService["get"]>,
  ): TlsCertValidation | undefined {
    const config = tls as { mode: string; certPath: string | null; keyPath: string | null };
    if (config.mode !== "custom-cert" || !config.certPath) return undefined;
    return validateCertFile(config.certPath);
  }

  private buildDnsHints(tls: ReturnType<ConfigurationService["get"]>): string[] {
    const config = tls as { mode: string; domain: string | null };
    if (config.mode === "off" || !config.domain) return [];
    return [
      `Create an A/AAAA record pointing ${config.domain} to this server's public IP.`,
      `Verify propagation: dig +short ${config.domain}`,
    ];
  }

  private buildPortHints(https: ReturnType<ConfigurationService["get"]>): string[] {
    const hints = [
      "Expose TCP 443 for HTTPS (Caddy profile) or use gateway on NEOCHAT_HTTP_PORT for Stage-1 HTTP.",
    ];
    if ((https as { redirectHttp: boolean }).redirectHttp) {
      hints.push("Expose TCP 80 for HTTP→HTTPS redirects when using Caddy.");
    }
    return hints;
  }

  private buildReverseProxyDocs(tls: ReturnType<ConfigurationService["get"]>) {
    const config = tls as { mode: string; domain: string | null };
    const stage = config.mode === "off" ? ("gateway" as const) : ("caddy" as const);
    return {
      stage,
      notes: [
        "Stage-1: nginx gateway routes /api, /admin, and / to api/web/admin containers.",
        "Stage-2: Caddy terminates TLS and reverse-proxies to the gateway or api directly.",
        "Use deploy/docker-compose.tls.yml with --profile caddy for HTTPS overlay.",
        "LiveKit WebSocket traffic requires wss:// on the same domain or a dedicated subdomain.",
      ],
      verificationChecklist: [
        "DNS resolves to this host",
        "Port 443 reachable from the internet (or your VPN)",
        "curl -I https://YOUR_DOMAIN/api/v1/health/live returns 200",
        "Admin panel loads at https://YOUR_DOMAIN/admin/",
        "WebSocket connects for messaging and calls",
      ],
    };
  }

  buildCaddyfileHint(
    tls: ReturnType<ConfigurationService["get"]>,
    https?: ReturnType<ConfigurationService["get"]>,
  ): string {
    const config = tls as {
      mode: string;
      domain: string | null;
      email: string | null;
      certPath: string | null;
      keyPath: string | null;
    };
    if (config.mode === "caddy-auto" && config.domain) {
      const emailLine = config.email ? `\n  email ${config.email}` : "";
      const redirect =
        https && (https as { redirectHttp: boolean }).redirectHttp
          ? "\n  redir http://{host}{uri} https://{host}{uri} permanent"
          : "";
      return `# Caddyfile hint\n${config.domain} {${emailLine}${redirect}\n  reverse_proxy localhost:${this.cfg.env.API_PORT}\n}\n`;
    }
    if (config.mode === "custom-cert" && config.domain && config.certPath && config.keyPath) {
      return `# Caddyfile hint\n${config.domain} {\n  tls ${config.certPath} ${config.keyPath}\n  reverse_proxy localhost:${this.cfg.env.API_PORT}\n}\n`;
    }
    return "# TLS is off or incomplete — no Caddyfile generated.\n";
  }

  private toInvite(row: typeof invites.$inferSelect) {
    return {
      id: row.id,
      code: row.code,
      createdBy: row.createdBy,
      maxUses: row.maxUses,
      uses: row.uses,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
