import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { ChatsModule } from "../chats/chats.module.js";
import { MediaController } from "./media.controller.js";
import { MediaService } from "./media.service.js";

@Module({
  imports: [AuditModule, ChatsModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
