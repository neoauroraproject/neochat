import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { randomUUID } from "node:crypto";
import { LoggerModule } from "nestjs-pino";
import { AdminModule } from "./admin/admin.module.js";
import { BackupModule } from "./backup/backup.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { MetricsModule } from "./metrics/metrics.module.js";
import { PluginHostModule } from "./plugin-host/plugin-host.module.js";
import { SecurityModule } from "./security/security.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CallsModule } from "./calls/calls.module.js";
import { ChatsModule } from "./chats/chats.module.js";
import { ConfigModule } from "./config/config.module.js";
import { loadEnv } from "./config/env.js";
import { JwtAuthGuard } from "./common/jwt-auth.guard.js";
import { MaintenanceGuard } from "./common/maintenance.guard.js";
import { DatabaseModule } from "./database/database.module.js";
import { FeatureFlagsModule } from "./feature-flags/feature-flags.module.js";
import { HealthModule } from "./health/health.module.js";
import { KeysModule } from "./keys/keys.module.js";
import { MediaModule } from "./media/media.module.js";
import { MessagesModule } from "./messages/messages.module.js";
import { PluginLoaderModule } from "./plugin-loader/plugin-loader.module.js";
import { PresenceModule } from "./presence/presence.module.js";
import { ProvidersModule } from "./providers/providers.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { SearchModule } from "./search/search.module.js";
import { SystemModule } from "./system/system.module.js";
import { UsersModule } from "./users/users.module.js";

const bootstrapEnv = loadEnv();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: bootstrapEnv.LOG_LEVEL,
        genReqId: (req, res) => {
          const incoming = req.headers["x-request-id"];
          const requestId =
            typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
          res.setHeader("x-request-id", requestId);
          return requestId;
        },
        customProps: (req) => ({ requestId: req.id }),
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
        },
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { ttl: bootstrapEnv.RATE_LIMIT_TTL * 1000, limit: bootstrapEnv.RATE_LIMIT_LIMIT },
    ]),
    DatabaseModule,
    RedisModule,
    ConfigModule,
    FeatureFlagsModule,
    ProvidersModule,
    PluginLoaderModule,
    HealthModule,
    SystemModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ChatsModule,
    CallsModule,
    MessagesModule,
    KeysModule,
    MediaModule,
    PresenceModule,
    SearchModule,
    AdminModule,
    BackupModule,
    JobsModule,
    MetricsModule,
    PluginHostModule,
    SecurityModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MaintenanceGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
