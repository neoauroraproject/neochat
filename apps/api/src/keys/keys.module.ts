import { Module } from "@nestjs/common";
import { KeysController } from "./keys.controller.js";
import { KeysService } from "./keys.service.js";

@Module({
  controllers: [KeysController],
  providers: [KeysService],
  exports: [KeysService],
})
export class KeysModule {}
