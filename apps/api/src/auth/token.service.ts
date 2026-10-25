import { Injectable } from "@nestjs/common";
import { type JwtService } from "@nestjs/jwt";
import { createHmac, randomBytes } from "node:crypto";
import type { JwtAccessClaims } from "@neochat/shared";
import { type ConfigurationService } from "../config/configuration.service.js";

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigurationService,
  ) {}

  async signAccessToken(
    claims: Omit<JwtAccessClaims, "typ">,
  ): Promise<{ token: string; expiresAt: Date }> {
    const ttl = this.cfg.env.JWT_ACCESS_TTL;
    const token = await this.jwt.signAsync(
      { ...claims, typ: "access" },
      { secret: this.cfg.env.JWT_ACCESS_SECRET, expiresIn: ttl },
    );
    return { token, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  /** Opaque refresh token: random secret returned to client; only its HMAC is stored. */
  generateRefreshToken(ttlSeconds = this.cfg.env.JWT_REFRESH_TTL): {
    token: string;
    hash: string;
    expiresAt: Date;
  } {
    const token = randomBytes(32).toString("base64url");
    return {
      token,
      hash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", this.cfg.env.JWT_REFRESH_PEPPER).update(token).digest("hex");
  }
}
