import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, ilike, isNull, lte, sql } from "drizzle-orm";
import type { MessageSearchQuery, SearchQuery } from "@neochat/shared";
import { type ChatMembershipService } from "../chats/chat-membership.service.js";
import type { Database } from "../database/drizzle.js";
import { chatMembers, chats, messages, users } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { type UsersService } from "../users/users.service.js";

@Injectable()
export class SearchService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly users: UsersService,
    private readonly membership: ChatMembershipService,
  ) {}

  async search(userId: string, query: SearchQuery) {
    const userResults = await this.users.search(query.q, userId, query.limit);

    const chatRows = await this.db
      .select({ chat: chats })
      .from(chatMembers)
      .innerJoin(chats, eq(chats.id, chatMembers.chatId))
      .where(and(eq(chatMembers.userId, userId), ilike(chats.title, `%${query.q}%`)))
      .limit(query.limit);

    return {
      users: userResults,
      chats: chatRows.map((r) => ({
        id: r.chat.id,
        type: r.chat.type,
        title: r.chat.title,
        avatarUrl: r.chat.avatarUrl,
      })),
    };
  }

  async searchMessages(userId: string, query: MessageSearchQuery) {
    await this.membership.requireMember(query.chatId, userId);

    const conditions = [eq(messages.chatId, query.chatId), isNull(messages.deletedAt)];
    if (query.contentType) conditions.push(eq(messages.contentType, query.contentType));
    if (query.from) conditions.push(gte(messages.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(messages.createdAt, new Date(query.to)));
    if (query.cursor !== undefined) {
      conditions.push(sql`${messages.serverSeq} < ${query.cursor}`);
    }

    const rows = await this.db
      .select({
        id: messages.id,
        chatId: messages.chatId,
        senderId: messages.senderId,
        serverSeq: messages.serverSeq,
        contentType: messages.contentType,
        createdAt: messages.createdAt,
        editedAt: messages.editedAt,
      })
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.serverSeq))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const slice = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? Number(slice[slice.length - 1]!.serverSeq) : null;

    return {
      items: slice.map((r) => ({
        id: r.id,
        chatId: r.chatId,
        senderId: r.senderId,
        serverSeq: Number(r.serverSeq),
        contentType: r.contentType,
        createdAt: r.createdAt.toISOString(),
        editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      })),
      nextCursor,
    };
  }
}
