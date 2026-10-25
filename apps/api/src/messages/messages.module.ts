import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesController } from "./messages.controller.js";
import { MessagesGateway } from "./messages.gateway.js";
import { MessagesService } from "./messages.service.js";
import { RealtimeBusService } from "./realtime-bus.service.js";

@Module({
  imports: [AuditModule, AuthModule, ChatsModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway, RealtimeBusService],
  exports: [MessagesService, RealtimeBusService],
})
export class MessagesModule {}
