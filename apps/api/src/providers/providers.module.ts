import { Global, Module } from "@nestjs/common";
import {
  LiveKitCallProvider,
  MinioStorageProvider,
  NoopCallProvider,
  NoopNotificationProvider,
  NoopPluginProvider,
  NoopSearchProvider,
  NoopStorageProvider,
  type CallProvider,
  type NotificationProvider,
  type PluginProvider,
  type SearchProvider,
  type StorageProvider,
} from "@neochat/providers";
import { ConfigurationService } from "../config/configuration.service.js";
import {
  CALL_PROVIDER,
  NOTIFICATION_PROVIDER,
  PLUGIN_PROVIDER,
  SEARCH_PROVIDER,
  STORAGE_PROVIDER,
} from "./provider.tokens.js";

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigurationService],
      useFactory: (cfg: ConfigurationService): StorageProvider => {
        if (cfg.env.STORAGE_PROVIDER === "minio") {
          return new MinioStorageProvider({
            endpoint: cfg.env.MINIO_ENDPOINT,
            port: cfg.env.MINIO_PORT,
            useSsl: cfg.env.MINIO_USE_SSL,
            accessKey: cfg.env.MINIO_ACCESS_KEY,
            secretKey: cfg.env.MINIO_SECRET_KEY,
            bucket: cfg.env.MINIO_BUCKET,
            region: cfg.env.MINIO_REGION,
          });
        }
        return new NoopStorageProvider();
      },
    },
    {
      provide: CALL_PROVIDER,
      inject: [ConfigurationService],
      useFactory: (cfg: ConfigurationService): CallProvider => {
        if (cfg.env.CALL_PROVIDER === "livekit") {
          return new LiveKitCallProvider({
            url: cfg.env.LIVEKIT_URL,
            apiKey: cfg.env.LIVEKIT_API_KEY,
            apiSecret: cfg.env.LIVEKIT_API_SECRET,
          });
        }
        return new NoopCallProvider();
      },
    },
    {
      provide: NOTIFICATION_PROVIDER,
      useFactory: (): NotificationProvider => new NoopNotificationProvider(),
    },
    { provide: SEARCH_PROVIDER, useFactory: (): SearchProvider => new NoopSearchProvider() },
    { provide: PLUGIN_PROVIDER, useFactory: (): PluginProvider => new NoopPluginProvider() },
  ],
  exports: [
    STORAGE_PROVIDER,
    CALL_PROVIDER,
    NOTIFICATION_PROVIDER,
    SEARCH_PROVIDER,
    PLUGIN_PROVIDER,
  ],
})
export class ProvidersModule {}
