import { Controller, Get, Query } from "@nestjs/common";
import { MessageSearchQuerySchema, SearchQuerySchema } from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type SearchService } from "./search.service.js";

@Controller("search")
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  global(
    @CurrentUser("sub") userId: string,
    @Query(new ZodValidationPipe(SearchQuerySchema)) query: { q: string; limit: number },
  ) {
    return this.search.search(userId, query);
  }

  @Get("messages")
  messages(
    @CurrentUser("sub") userId: string,
    @Query(new ZodValidationPipe(MessageSearchQuerySchema))
    query: {
      chatId: string;
      contentType?: "text" | "media" | "system";
      from?: string;
      to?: string;
      limit: number;
      cursor?: number;
    },
  ) {
    return this.search.searchMessages(userId, query);
  }
}
