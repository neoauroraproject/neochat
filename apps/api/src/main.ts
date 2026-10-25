import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { GlobalExceptionFilter } from "./common/global-exception.filter.js";
import { requestIdMiddleware } from "./common/request-id.middleware.js";
import { loadEnv } from "./config/env.js";
import { APP_VERSION } from "./system/system.service.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "wss:", "ws:", "https:"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.enableCors({
    origin: [env.PUBLIC_WEB_URL, env.PUBLIC_ADMIN_URL],
    credentials: true,
    exposedHeaders: ["x-request-id"],
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("NeoChat API")
    .setDescription("NeoChat v1.0.0-rc.1 — secure messaging platform API")
    .setVersion(APP_VERSION)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = env.API_PORT;
  await app.listen(port, env.API_HOST);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
