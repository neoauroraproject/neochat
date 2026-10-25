import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import argon2 from "argon2";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type {
  AuthSession,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  SessionInfo,
  SetupRequest,
  SetupStatus,
  TokenPair,
  TrustDeviceRequest,
} from "@neochat/shared";
import { type ConfigurationService } from "../config/configuration.service.js";
import type { Database } from "../database/drizzle.js";
import {
  credentials,
  devices,
  invites,
  refreshTokens,
  sessions,
  users,
} from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { type AuditService } from "../audit/audit.service.js";
import { type FeatureFlagsService } from "../feature-flags/feature-flags.service.js";
import { type BruteForceService } from "../security/brute-force.service.js";
import { type TokenService } from "./token.service.js";

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  deviceName?: string;
  devicePublicKey?: string;
  rememberMe?: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly cfg: ConfigurationService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
    private readonly bruteForce: BruteForceService,
  ) {}

  private async argonOptions() {
    return {
      type: argon2.argon2id,
      memoryCost: this.cfg.env.ARGON2_MEMORY_COST,
      timeCost: this.cfg.env.ARGON2_TIME_COST,
      parallelism: this.cfg.env.ARGON2_PARALLELISM,
    } as const;
  }

  async setupStatus(): Promise<SetupStatus> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "admin"));
    const count = row?.count ?? 0;
    return {
      needsSetup: count === 0 && this.cfg.env.ALLOW_FIRST_RUN_SETUP,
      instanceName: this.cfg.get("general").instanceName,
    };
  }

  async runSetup(input: SetupRequest, meta: RequestMeta): Promise<AuthSession> {
    const status = await this.setupStatus();
    if (!status.needsSetup) throw new ForbiddenException("Setup already completed");

    const hash = await argon2.hash(input.admin.password, await this.argonOptions());
    const [admin] = await this.db
      .insert(users)
      .values({
        username: input.admin.username,
        displayName: input.admin.displayName,
        role: "admin",
        locale: input.defaultLocale,
      })
      .returning();
    await this.db.insert(credentials).values({ userId: admin!.id, passwordHash: hash });

    await this.cfg.set("general", "instanceName", input.instanceName);
    await this.cfg.set("general", "defaultLocale", input.defaultLocale);
    await this.cfg.set("general", "allowOpenRegistration", input.allowOpenRegistration);
    await this.cfg.set("security", "requireInviteToRegister", !input.allowOpenRegistration);

    if (input.http) {
      await this.cfg.set("http", "host", input.http.host);
      await this.cfg.set("http", "port", input.http.port);
    }
    if (input.storage) {
      await this.cfg.set("storage", "driver", input.storage.driver);
      await this.cfg.set("storage", "path", input.storage.path);
      if (input.storage.bucket) {
        await this.cfg.set("storage", "bucket", input.storage.bucket);
      }
    }

    await this.audit.record({ actorId: admin!.id, action: "auth.setup", ip: meta.ip });
    return this.issueSession(admin!.id, admin!.role, meta);
  }

  async register(input: RegisterRequest, meta: RequestMeta): Promise<AuthSession> {
    const security = this.cfg.get("security");
    const general = this.cfg.get("general");

    if (security.requireInviteToRegister && !general.allowOpenRegistration) {
      if (!input.inviteCode) throw new ForbiddenException("An invite code is required");
      await this.consumeInvite(input.inviteCode);
    }

    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${input.username})`)
      .limit(1);
    if (existing.length > 0) throw new ConflictException("Username already taken");

    const hash = await argon2.hash(input.password, await this.argonOptions());
    const [user] = await this.db
      .insert(users)
      .values({
        username: input.username,
        displayName: input.displayName,
        role: "user",
        locale: input.locale ?? general.defaultLocale,
      })
      .returning();
    await this.db.insert(credentials).values({ userId: user!.id, passwordHash: hash });
    await this.audit.record({ actorId: user!.id, action: "auth.register", ip: meta.ip });
    return this.issueSession(user!.id, user!.role, meta);
  }

  async login(input: LoginRequest, meta: RequestMeta): Promise<AuthSession> {
    if (await this.bruteForce.isLocked(input.username)) {
      throw new ForbiddenException("Too many failed login attempts. Try again later.");
    }

    const [row] = await this.db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        hash: credentials.passwordHash,
      })
      .from(users)
      .innerJoin(credentials, eq(credentials.userId, users.id))
      .where(sql`lower(${users.username}) = lower(${input.username})`)
      .limit(1);

    if (!row) {
      await argon2.hash(input.password, await this.argonOptions()).catch(() => undefined);
      await this.bruteForce.recordFailure(input.username);
      throw new UnauthorizedException("Incorrect username or password");
    }
    if (row.status !== "active") throw new ForbiddenException("Account is not active");

    const ok = await argon2.verify(row.hash, input.password).catch(() => false);
    if (!ok) {
      await this.bruteForce.recordFailure(input.username);
      throw new UnauthorizedException("Incorrect username or password");
    }

    await this.bruteForce.clearFailures(input.username);
    return this.issueSession(row.id, row.role, {
      ...meta,
      devicePublicKey: input.devicePublicKey,
      deviceName: input.deviceName ?? meta.deviceName,
      rememberMe: input.rememberMe ?? false,
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
      .limit(1);

    if (!row || row.expiresAt.getTime() < Date.now() || row.usedAt) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const [session] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, row.sessionId), isNull(sessions.revokedAt)))
      .limit(1);
    if (!session) throw new UnauthorizedException("Session revoked");

    const [user] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    // Rotate: mark old used, issue a new one bound to the same session.
    await this.db
      .update(refreshTokens)
      .set({ usedAt: new Date(), revokedAt: new Date() })
      .where(eq(refreshTokens.id, row.id));
    return this.mintTokens(session.id, session.userId, session.deviceId, user?.role ?? "user");
  }

  async logout(refreshToken: string): Promise<void> {
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hash))
      .limit(1);
    if (row) {
      await this.db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.sessionId, row.sessionId));
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, row.sessionId));
    }
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionInfo[]> {
    const rows = await this.db
      .select({
        session: sessions,
        device: devices,
      })
      .from(sessions)
      .innerJoin(devices, eq(devices.id, sessions.deviceId))
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastUsedAt));

    return rows.map((r) => ({
      id: r.session.id,
      deviceId: r.session.deviceId,
      deviceName: r.device.name,
      ip: r.session.ip,
      userAgent: r.session.userAgent,
      createdAt: r.session.createdAt.toISOString(),
      lastUsedAt: r.session.lastUsedAt.toISOString(),
      current: r.session.id === currentSessionId,
      trusted: Boolean(r.device.trustedAt),
    }));
  }

  async trustDevice(
    userId: string,
    deviceId: string,
    input: TrustDeviceRequest,
  ): Promise<{ ok: true }> {
    const [row] = await this.db
      .select({ hash: credentials.passwordHash })
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1);
    if (!row) throw new NotFoundException("Credentials not found");

    const ok = await argon2.verify(row.hash, input.password).catch(() => false);
    if (!ok) throw new UnauthorizedException("Password confirmation failed");

    const [device] = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
      .limit(1);
    if (!device) throw new NotFoundException("Device not found");

    await this.db.update(devices).set({ trustedAt: new Date() }).where(eq(devices.id, deviceId));
    await this.audit.record({
      actorId: userId,
      action: "security.device.trust",
      targetType: "device",
      targetId: deviceId,
    });
    return { ok: true };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ): Promise<{ ok: true }> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.revokedAt)),
      )
      .limit(1);
    if (!session) throw new NotFoundException("Session not found");

    const now = new Date();
    await this.db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.sessionId, sessionId));

    await this.audit.record({
      actorId: userId,
      action: "auth.session.revoke",
      targetType: "session",
      targetId: sessionId,
      metadata: { current: sessionId === currentSessionId },
    });
    return { ok: true };
  }

  async changePassword(userId: string, input: ChangePasswordRequest): Promise<{ ok: true }> {
    const security = this.cfg.get("security");
    if (input.newPassword.length < security.passwordMinLength) {
      throw new BadRequestException(
        `Password must be at least ${security.passwordMinLength} characters`,
      );
    }

    const [row] = await this.db
      .select({ hash: credentials.passwordHash })
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1);
    if (!row) throw new NotFoundException("Credentials not found");

    const ok = await argon2.verify(row.hash, input.currentPassword).catch(() => false);
    if (!ok) throw new UnauthorizedException("Current password is incorrect");

    const hash = await argon2.hash(input.newPassword, await this.argonOptions());
    await this.db
      .update(credentials)
      .set({ passwordHash: hash, updatedAt: new Date() })
      .where(eq(credentials.userId, userId));
    await this.audit.record({ actorId: userId, action: "auth.password.change" });
    return { ok: true };
  }

  private refreshTtlSeconds(rememberMe: boolean): number {
    const base = this.cfg.env.JWT_REFRESH_TTL;
    if (!rememberMe) return base;
    if (!this.flags.isEnabled("auth.rememberMe")) return base;
    return base * 4;
  }

  private async issueSession(
    userId: string,
    role: string,
    meta: RequestMeta,
  ): Promise<AuthSession> {
    const [device] = await this.db
      .insert(devices)
      .values({
        userId,
        name: meta.deviceName ?? "Unknown device",
        publicKey: meta.devicePublicKey ?? null,
        lastSeenAt: new Date(),
      })
      .returning();
    const [session] = await this.db
      .insert(sessions)
      .values({ userId, deviceId: device!.id, ip: meta.ip, userAgent: meta.userAgent })
      .returning();

    const tokens = await this.mintTokens(
      session!.id,
      userId,
      device!.id,
      role,
      this.refreshTtlSeconds(meta.rememberMe ?? false),
    );
    return { userId, deviceId: device!.id, sessionId: session!.id, tokens };
  }

  private async mintTokens(
    sessionId: string,
    userId: string,
    deviceId: string,
    role: string,
    refreshTtlSeconds = this.cfg.env.JWT_REFRESH_TTL,
  ): Promise<TokenPair> {
    const access = await this.tokens.signAccessToken({
      sub: userId,
      sid: sessionId,
      did: deviceId,
      role: role === "admin" ? "admin" : "user",
    });
    const refresh = this.tokens.generateRefreshToken(refreshTtlSeconds);
    await this.db.insert(refreshTokens).values({
      sessionId,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    };
  }

  private async consumeInvite(code: string): Promise<void> {
    const [invite] = await this.db.select().from(invites).where(eq(invites.code, code)).limit(1);
    if (!invite || invite.revokedAt) throw new BadRequestException("Invalid invite code");
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Invite code expired");
    }
    if (invite.uses >= invite.maxUses) throw new BadRequestException("Invite code exhausted");
    await this.db
      .update(invites)
      .set({ uses: invite.uses + 1 })
      .where(eq(invites.id, invite.id));
  }
}
