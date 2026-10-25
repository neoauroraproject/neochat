import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  AddMembersRequest,
  Chat,
  ChatMember,
  CreateChatRequest,
  MarkReadRequest,
  UpdateChatRequest,
  UpdateMemberRoleRequest,
} from "@neochat/shared";
import { type AuditService } from "../audit/audit.service.js";
import type { Database } from "../database/drizzle.js";
import {
  chats,
  chatMembers,
  chatSequences,
  drafts,
  messages,
  users,
} from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { type ChatMembershipService } from "./chat-membership.service.js";

@Injectable()
export class ChatsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly membership: ChatMembershipService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<Chat[]> {
    const rows = await this.db
      .select({
        chat: chats,
        member: chatMembers,
        memberCount: sql<number>`(
          SELECT count(*)::int FROM chat_members cm WHERE cm.chat_id = ${chats.id}
        )`,
        maxSeq: sql<number | null>`(
          SELECT max(m.server_seq)::bigint FROM messages m WHERE m.chat_id = ${chats.id}
        )`,
      })
      .from(chatMembers)
      .innerJoin(chats, eq(chats.id, chatMembers.chatId))
      .where(eq(chatMembers.userId, userId))
      .orderBy(desc(chats.updatedAt));

    return rows.map((r) => {
      const maxSeq = Number(r.maxSeq ?? 0);
      const lastRead = Number(r.member.lastReadSeq);
      return this.toChat(r.chat, r.memberCount, Math.max(0, maxSeq - lastRead));
    });
  }

  async get(chatId: string, userId: string): Promise<Chat> {
    await this.membership.requireMember(chatId, userId);
    const chat = await this.membership.getChatOrThrow(chatId);
    const [counts] = await this.db
      .select({
        memberCount: sql<number>`count(*)::int`,
        maxSeq: sql<number | null>`(
          SELECT max(m.server_seq)::bigint FROM messages m WHERE m.chat_id = ${chatId}
        )`,
      })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, chatId));

    const [member] = await this.db
      .select()
      .from(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)))
      .limit(1);

    const maxSeq = Number(counts?.maxSeq ?? 0);
    const lastRead = Number(member?.lastReadSeq ?? 0);
    return this.toChat(chat, counts?.memberCount ?? 0, Math.max(0, maxSeq - lastRead));
  }

  async create(userId: string, input: CreateChatRequest): Promise<Chat> {
    const memberIds = [...new Set([userId, ...input.memberIds])];

    if (input.type === "dm") {
      if (memberIds.length !== 2) {
        throw new BadRequestException("DM chats require exactly two members");
      }
      const existing = await this.findExistingDm(
        userId,
        memberIds.find((id) => id !== userId)!,
      );
      if (existing) return this.get(existing, userId);
    }

    const [chat] = await this.db
      .insert(chats)
      .values({
        type: input.type,
        title: input.title ?? null,
        description: input.description ?? null,
        createdBy: userId,
        isReadonly: input.type === "channel",
      })
      .returning();

    await this.db.insert(chatSequences).values({ chatId: chat!.id, nextSeq: 1 });

    const memberRows = memberIds.map((id, index) => ({
      chatId: chat!.id,
      userId: id,
      role: id === userId ? "owner" : "member",
      lastReadSeq: index === 0 ? 0 : 0,
    }));
    await this.db.insert(chatMembers).values(memberRows);

    await this.audit.record({
      actorId: userId,
      action: "chat.create",
      targetType: "chat",
      targetId: chat!.id,
      metadata: { type: input.type },
    });

    return this.get(chat!.id, userId);
  }

  async update(chatId: string, userId: string, patch: UpdateChatRequest): Promise<Chat> {
    await this.membership.requireAdmin(chatId, userId);
    await this.db
      .update(chats)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        ...(patch.isReadonly !== undefined ? { isReadonly: patch.isReadonly } : {}),
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId));
    return this.get(chatId, userId);
  }

  async listMembers(chatId: string, userId: string): Promise<ChatMember[]> {
    await this.membership.requireMember(chatId, userId);
    const rows = await this.db
      .select({ member: chatMembers, user: users })
      .from(chatMembers)
      .innerJoin(users, eq(users.id, chatMembers.userId))
      .where(eq(chatMembers.chatId, chatId));

    return rows.map((r) => ({
      chatId: r.member.chatId,
      userId: r.member.userId,
      role: r.member.role as ChatMember["role"],
      mutedUntil: r.member.mutedUntil ? r.member.mutedUntil.toISOString() : null,
      lastReadSeq: Number(r.member.lastReadSeq),
      joinedAt: r.member.joinedAt.toISOString(),
      user: {
        id: r.user.id,
        username: r.user.username,
        displayName: r.user.displayName,
        avatarUrl: r.user.avatarUrl,
        bio: r.user.bio,
      },
    }));
  }

  async addMembers(
    chatId: string,
    userId: string,
    input: AddMembersRequest,
  ): Promise<ChatMember[]> {
    await this.membership.requireAdmin(chatId, userId);
    const chat = await this.membership.getChatOrThrow(chatId);
    if (chat.type === "dm") throw new BadRequestException("Cannot add members to a DM");

    const uniqueIds = [...new Set(input.memberIds)].filter((id) => id !== userId);
    if (uniqueIds.length === 0) return this.listMembers(chatId, userId);

    await this.db
      .insert(chatMembers)
      .values(uniqueIds.map((id) => ({ chatId, userId: id, role: "member" })))
      .onConflictDoNothing();

    await this.db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, chatId));
    return this.listMembers(chatId, userId);
  }

  async updateMemberRole(
    chatId: string,
    actorId: string,
    targetUserId: string,
    input: UpdateMemberRoleRequest,
  ): Promise<ChatMember[]> {
    await this.membership.requireOwner(chatId, actorId);
    if (targetUserId === actorId && input.role !== "owner") {
      throw new BadRequestException("Cannot demote yourself as the sole owner");
    }
    await this.db
      .update(chatMembers)
      .set({ role: input.role })
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, targetUserId)));
    return this.listMembers(chatId, actorId);
  }

  async leave(chatId: string, userId: string): Promise<{ ok: true }> {
    const member = await this.membership.requireMember(chatId, userId);
    const chat = await this.membership.getChatOrThrow(chatId);

    if (chat.type === "dm") {
      throw new BadRequestException("Cannot leave a DM; delete it instead");
    }

    if (member.role === "owner") {
      const owners = await this.db
        .select()
        .from(chatMembers)
        .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.role, "owner")));
      if (owners.length <= 1) {
        throw new ConflictException("Transfer ownership before leaving");
      }
    }

    await this.db
      .delete(chatMembers)
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)));
    return { ok: true };
  }

  async join(chatId: string, userId: string): Promise<Chat> {
    const chat = await this.membership.getChatOrThrow(chatId);
    if (chat.type === "dm") throw new BadRequestException("DM chats cannot be joined directly");

    await this.db
      .insert(chatMembers)
      .values({ chatId, userId, role: "member" })
      .onConflictDoNothing();

    return this.get(chatId, userId);
  }

  async markRead(chatId: string, userId: string, input: MarkReadRequest): Promise<{ ok: true }> {
    await this.membership.requireMember(chatId, userId);
    await this.db
      .update(chatMembers)
      .set({ lastReadSeq: input.lastReadSeq })
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)));
    return { ok: true };
  }

  async pinMessage(chatId: string, userId: string, messageId: string) {
    await this.membership.requireAdmin(chatId, userId);
    const [msg] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)))
      .limit(1);
    if (!msg) throw new NotFoundException("Message not found");

    await this.db.update(messages).set({ pinnedAt: new Date() }).where(eq(messages.id, messageId));
    return { ok: true, messageId };
  }

  async unpinMessage(chatId: string, userId: string, messageId: string) {
    await this.membership.requireAdmin(chatId, userId);
    await this.db.update(messages).set({ pinnedAt: null }).where(eq(messages.id, messageId));
    return { ok: true, messageId };
  }

  async getDraft(chatId: string, userId: string) {
    await this.membership.requireMember(chatId, userId);
    const [row] = await this.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.chatId, chatId), eq(drafts.userId, userId)))
      .limit(1);
    if (!row) return null;
    return {
      chatId: row.chatId,
      ciphertext: row.ciphertext,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertDraft(chatId: string, userId: string, ciphertext: string) {
    await this.membership.requireMember(chatId, userId);
    const [row] = await this.db
      .insert(drafts)
      .values({ chatId, userId, ciphertext, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [drafts.userId, drafts.chatId],
        set: { ciphertext, updatedAt: new Date() },
      })
      .returning();
    return {
      chatId: row!.chatId,
      ciphertext: row!.ciphertext,
      updatedAt: row!.updatedAt.toISOString(),
    };
  }

  async deleteDraft(chatId: string, userId: string) {
    await this.membership.requireMember(chatId, userId);
    await this.db.delete(drafts).where(and(eq(drafts.chatId, chatId), eq(drafts.userId, userId)));
    return { ok: true };
  }

  private async findExistingDm(userA: string, userB: string): Promise<string | null> {
    const rows = await this.db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .innerJoin(chats, eq(chats.id, chatMembers.chatId))
      .where(and(eq(chats.type, "dm"), inArray(chatMembers.userId, [userA, userB])));

    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.chatId, (counts.get(row.chatId) ?? 0) + 1);
    }
    for (const [chatId, count] of counts) {
      if (count === 2) return chatId;
    }
    return null;
  }

  private toChat(row: typeof chats.$inferSelect, memberCount: number, unreadCount: number): Chat {
    return {
      id: row.id,
      type: row.type as Chat["type"],
      title: row.title,
      description: row.description,
      avatarUrl: row.avatarUrl,
      isReadonly: row.isReadonly,
      memberCount,
      unreadCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
