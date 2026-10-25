import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { ChatMembershipService } from "./chat-membership.service.js";
import { ChatsController } from "./chats.controller.js";
import { ChatsService } from "./chats.service.js";

@Module({
  imports: [AuditModule],
  controllers: [ChatsController],
  providers: [ChatsService, ChatMembershipService],
  exports: [ChatsService, ChatMembershipService],
})
export class ChatsModule {}
