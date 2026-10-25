import { Module, forwardRef } from "@nestjs/common";
import { PresenceModule } from "../presence/presence.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [forwardRef(() => PresenceModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
