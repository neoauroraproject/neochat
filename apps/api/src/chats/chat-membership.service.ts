import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Database } from "../database/drizzle.js";
import { chatMembers, chats } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";

@Injectable()
export class ChatMembershipService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async requireMember(chatId: string, userId: string) {
    const [member] = await this.db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
      .limit(1);
    if (!member) throw new ForbiddenException("Not a member of this chat");
    return member;
  }

  async requireAdmin(chatId: string, userId: string) {
    const member = await this.requireMember(chatId, userId);
    if (!["owner", "admin", "moderator"].includes(member.role)) {
      throw new ForbiddenException("Insufficient chat permissions");
    }
    return member;
  }

  async requireOwner(chatId: string, userId: string) {
    const member = await this.requireMember(chatId, userId);
    if (member.role !== "owner") {
      throw new ForbiddenException("Owner permissions required");
    }
    return member;
  }

  async getChatOrThrow(chatId: string) {
    const [chat] = await this.db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    if (!chat) throw new NotFoundException("Chat not found");
    return chat;
  }

  async isReadonlyChannel(chatId: string): Promise<boolean> {
    const chat = await this.getChatOrThrow(chatId);
    return chat.type === "channel" && chat.isReadonly;
  }
}
