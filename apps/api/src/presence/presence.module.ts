import { Module, forwardRef } from "@nestjs/common";
import { MessagesModule } from "../messages/messages.module.js";
import { PresenceController } from "./presence.controller.js";
import { PresenceService } from "./presence.service.js";

@Module({
  imports: [forwardRef(() => MessagesModule)],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
