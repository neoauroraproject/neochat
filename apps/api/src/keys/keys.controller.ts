import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PublishKeysRequestSchema, type PublishKeysRequest } from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type KeysService } from "./keys.service.js";

@Controller("keys")
export class KeysController {
  constructor(private readonly keys: KeysService) {}

  @Post("publish")
  publish(
    @CurrentUser("sub") userId: string,
    @Body(new ZodValidationPipe(PublishKeysRequestSchema)) body: PublishKeysRequest,
  ) {
    return this.keys.publish(userId, body);
  }

  @Get("users/:userId/devices/:deviceId")
  getBundle(@Param("userId") userId: string, @Param("deviceId") deviceId: string) {
    return this.keys.getBundle(userId, deviceId);
  }

  @Get("users/:userId")
  listBundles(@Param("userId") userId: string) {
    return this.keys.listDeviceBundles(userId);
  }
}
