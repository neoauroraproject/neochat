import { Module } from "@nestjs/common";
import { ChatsModule } from "../chats/chats.module.js";
import { UsersModule } from "../users/users.module.js";
import { SearchController } from "./search.controller.js";
import { SearchService } from "./search.service.js";

@Module({
  imports: [UsersModule, ChatsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
