import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { loadEnv } from "../config/env.js";

export const REDIS = Symbol("REDIS");

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => {
        const env = loadEnv();
        return new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
