import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UpdateProfileRequestSchema, type UpdateProfileRequest } from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type UsersService } from "./users.service.js";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  me(@CurrentUser("sub") userId: string) {
    return this.users.getProfile(userId);
  }

  @Patch("me")
  updateMe(
    @CurrentUser("sub") userId: string,
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema)) body: UpdateProfileRequest,
  ) {
    return this.users.updateProfile(userId, body);
  }

  @Get("me/devices")
  devices(@CurrentUser("sub") userId: string, @CurrentUser("did") deviceId: string) {
    return this.users.listDevices(userId, deviceId);
  }

  @Delete("me/devices/:id")
  revokeDevice(@CurrentUser("sub") userId: string, @Param("id") deviceId: string) {
    return this.users.revokeDevice(userId, deviceId);
  }

  @Get("search")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(@CurrentUser("sub") userId: string, @Query("q") q = "") {
    return this.users.search(q, userId);
  }

  @Post("me/avatar")
  avatarUpload(@CurrentUser("sub") userId: string) {
    return this.users.createAvatarUploadSlot(userId);
  }
}
