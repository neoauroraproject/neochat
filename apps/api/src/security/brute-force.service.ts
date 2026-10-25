import { Injectable } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { type Redis } from "ioredis";
import { REDIS } from "../redis/redis.module.js";
import { type ConfigurationService } from "../config/configuration.service.js";

@Injectable()
export class BruteForceService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly cfg: ConfigurationService,
  ) {}

  private failKey(username: string): string {
    return `auth:login:fail:${username.toLowerCase()}`;
  }

  private lockKey(username: string): string {
    return `auth:login:lock:${username.toLowerCase()}`;
  }

  async isLocked(username: string): Promise<boolean> {
    const locked = await this.redis.get(this.lockKey(username));
    return locked === "1";
  }

  async recordFailure(username: string): Promise<{ locked: boolean; attempts: number }> {
    const security = this.cfg.get("security");
    const failKey = this.failKey(username);
    const attempts = await this.redis.incr(failKey);
    if (attempts === 1) {
      await this.redis.expire(failKey, security.loginLockoutMinutes * 60);
    }
    if (attempts >= security.loginMaxAttempts) {
      await this.redis.set(this.lockKey(username), "1", "EX", security.loginLockoutMinutes * 60);
      await this.redis.del(failKey);
      return { locked: true, attempts };
    }
    return { locked: false, attempts };
  }

  async clearFailures(username: string): Promise<void> {
    await this.redis.del(this.failKey(username), this.lockKey(username));
  }
}
