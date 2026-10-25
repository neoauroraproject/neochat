import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { MessagesModule } from "../messages/messages.module.js";
import { CallsController } from "./calls.controller.js";
import { CallsService } from "./calls.service.js";

@Module({
  imports: [ChatsModule, MessagesModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
