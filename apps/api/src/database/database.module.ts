import { Global, Module, type OnModuleDestroy, Inject } from "@nestjs/common";
import { loadEnv } from "../config/env.js";
import { createDb, createPgClient } from "./drizzle.js";
import { DRIZZLE, PG_CLIENT } from "./tokens.js";

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      useFactory: () => {
        const env = loadEnv();
        return createPgClient(env.DATABASE_URL);
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: ReturnType<typeof createPgClient>) => createDb(client),
    },
  ],
  exports: [DRIZZLE, PG_CLIENT],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_CLIENT) private readonly client: ReturnType<typeof createPgClient>) {}

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 }).catch(() => undefined);
  }
}
