import { Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type PresenceService } from "./presence.service.js";

@Controller("presence")
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Post("heartbeat")
  heartbeat(@CurrentUser("sub") userId: string) {
    return this.presence.heartbeat(userId);
  }

  @Post("offline")
  offline(@CurrentUser("sub") userId: string) {
    return this.presence.goOffline(userId);
  }

  @Get(":userId")
  get(@Param("userId") userId: string) {
    return this.presence.getPresence(userId);
  }
}
