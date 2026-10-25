import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Redis as RedisClient } from "ioredis";
import type { Database } from "../database/drizzle.js";
import { users } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { REDIS } from "../redis/redis.module.js";
import { type RealtimeBusService } from "../messages/realtime-bus.service.js";

const PRESENCE_KEY = (userId: string) => `presence:${userId}`;
const PRESENCE_TTL_SECONDS = 120;

@Injectable()
export class PresenceService implements OnModuleDestroy {
  private heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly bus: RealtimeBusService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
  }

  async heartbeat(userId: string): Promise<{ online: true }> {
    await this.redis.connect().catch(() => undefined);
    await this.redis.set(PRESENCE_KEY(userId), "1", "EX", PRESENCE_TTL_SECONDS);
    await this.db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));

    if (!this.heartbeatTimers.has(userId)) {
      const timer = setInterval(() => {
        void this.redis.expire(PRESENCE_KEY(userId), PRESENCE_TTL_SECONDS).catch(() => undefined);
      }, 60_000);
      this.heartbeatTimers.set(userId, timer);
    }

    await this.bus.publish({
      type: "presence.updated",
      userId,
      online: true,
      lastSeenAt: new Date().toISOString(),
    });
    return { online: true };
  }

  async isOnline(userId: string): Promise<boolean> {
    await this.redis.connect().catch(() => undefined);
    const value = await this.redis.get(PRESENCE_KEY(userId));
    return value === "1";
  }

  async getPresence(userId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const online = await this.isOnline(userId);
    return {
      userId,
      online,
      lastSeenAt: row?.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    };
  }

  async goOffline(userId: string): Promise<void> {
    await this.redis.del(PRESENCE_KEY(userId));
    const now = new Date();
    await this.db.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId));
    const timer = this.heartbeatTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(userId);
    }
    await this.bus.publish({
      type: "presence.updated",
      userId,
      online: false,
      lastSeenAt: now.toISOString(),
    });
  }
}
