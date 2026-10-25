import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type {
  EditMessageRequest,
  ForwardMessageRequest,
  Message,
  ReactRequest,
  ReadReceiptRequest,
  SendMessageRequest,
} from "@neochat/shared";
import { type AuditService } from "../audit/audit.service.js";
import { type ChatMembershipService } from "../chats/chat-membership.service.js";
import type { Database } from "../database/drizzle.js";
import {
  chatSequences,
  chats,
  messageReceipts,
  messages,
  reactions,
} from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { type RealtimeBusService } from "./realtime-bus.service.js";

@Injectable()
export class MessagesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly membership: ChatMembershipService,
    private readonly audit: AuditService,
    private readonly bus: RealtimeBusService,
  ) {}

  async list(
    chatId: string,
    userId: string,
    cursor?: number,
    limit = 30,
  ): Promise<{ items: Message[]; nextCursor: number | null }> {
    await this.membership.requireMember(chatId, userId);

    const conditions = [eq(messages.chatId, chatId), isNull(messages.deletedAt)];
    if (cursor !== undefined) {
      conditions.push(lt(messages.serverSeq, cursor));
    }

    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.serverSeq))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const items = slice.reverse().map((r) => this.toMessage(r));
    const nextCursor = hasMore ? Number(slice[0]!.serverSeq) : null;
    return { items, nextCursor };
  }

  async send(userId: string, deviceId: string, input: SendMessageRequest): Promise<Message> {
    await this.membership.requireMember(input.chatId, userId);
    if (await this.membership.isReadonlyChannel(input.chatId)) {
      const member = await this.membership.requireMember(input.chatId, userId);
      if (!["owner", "admin", "moderator"].includes(member.role)) {
        throw new ForbiddenException("Channel is read-only");
      }
    }

    const serverSeq = await this.nextSeq(input.chatId);
    const [row] = await this.db
      .insert(messages)
      .values({
        chatId: input.chatId,
        senderId: userId,
        senderDeviceId: deviceId,
        serverSeq,
        contentType: input.contentType,
        ciphertext: input.envelope.ciphertext,
        nonce: input.envelope.header,
        ratchetHeader: {
          algorithm: input.envelope.algorithm,
          header: input.envelope.header,
          senderDeviceId: input.envelope.senderDeviceId,
        },
        replyToId: input.replyToId ?? null,
      })
      .returning();

    await this.db.update(chats).set({ updatedAt: new Date() }).where(eq(chats.id, input.chatId));

    const message = this.toMessage(row!, input.clientId);
    await this.bus.publish({ type: "message.created", chatId: input.chatId, message });
    await this.audit.record({
      actorId: userId,
      action: "message.send",
      targetType: "message",
      targetId: row!.id,
      metadata: { chatId: input.chatId, contentType: input.contentType },
    });
    return message;
  }

  async edit(messageId: string, userId: string, input: EditMessageRequest): Promise<Message> {
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException("Message not found");
    if (existing.senderId !== userId)
      throw new ForbiddenException("Cannot edit another user's message");
    await this.membership.requireMember(existing.chatId, userId);

    const [row] = await this.db
      .update(messages)
      .set({
        ciphertext: input.envelope.ciphertext,
        nonce: input.envelope.header,
        ratchetHeader: {
          algorithm: input.envelope.algorithm,
          header: input.envelope.header,
          senderDeviceId: input.envelope.senderDeviceId,
        },
        editedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    const message = this.toMessage(row!);
    await this.bus.publish({ type: "message.updated", chatId: existing.chatId, message });
    return message;
  }

  async remove(messageId: string, userId: string): Promise<{ ok: true }> {
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!existing) throw new NotFoundException("Message not found");

    const member = await this.membership.requireMember(existing.chatId, userId);
    if (existing.senderId !== userId && !["owner", "admin", "moderator"].includes(member.role)) {
      throw new ForbiddenException("Cannot delete this message");
    }

    await this.db.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, messageId));

    await this.bus.publish({
      type: "message.deleted",
      chatId: existing.chatId,
      messageId,
    });
    return { ok: true };
  }

  async forward(
    messageId: string,
    userId: string,
    deviceId: string,
    input: ForwardMessageRequest,
  ): Promise<Message> {
    const [source] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1);
    if (!source) throw new NotFoundException("Message not found");
    await this.membership.requireMember(source.chatId, userId);
    await this.membership.requireMember(input.targetChatId, userId);

    const envelope = input.envelope ?? {
      algorithm: (source.ratchetHeader as { algorithm?: string } | null)?.algorithm ?? "unknown",
      header: source.nonce ?? "",
      ciphertext: source.ciphertext,
      senderDeviceId: deviceId,
    };

    const serverSeq = await this.nextSeq(input.targetChatId);
    const [row] = await this.db
      .insert(messages)
      .values({
        chatId: input.targetChatId,
        senderId: userId,
        senderDeviceId: deviceId,
        serverSeq,
        contentType: source.contentType,
        ciphertext: envelope.ciphertext,
        nonce: envelope.header,
        ratchetHeader: {
          algorithm: envelope.algorithm,
          header: envelope.header,
          senderDeviceId: envelope.senderDeviceId,
        },
        forwardedFromId: messageId,
      })
      .returning();

    await this.db
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, input.targetChatId));

    const message = this.toMessage(row!);
    await this.bus.publish({ type: "message.created", chatId: input.targetChatId, message });
    return message;
  }

  async react(messageId: string, userId: string, input: ReactRequest) {
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException("Message not found");
    await this.membership.requireMember(existing.chatId, userId);

    await this.db
      .insert(reactions)
      .values({ messageId, userId, emoji: input.emoji })
      .onConflictDoNothing();

    return { ok: true, messageId, emoji: input.emoji };
  }

  async unreact(messageId: string, userId: string, emoji: string) {
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!existing) throw new NotFoundException("Message not found");
    await this.membership.requireMember(existing.chatId, userId);

    await this.db
      .delete(reactions)
      .where(
        and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, userId),
          eq(reactions.emoji, emoji),
        ),
      );
    return { ok: true };
  }

  async recordReceipt(userId: string, deviceId: string, input: ReadReceiptRequest) {
    const [existing] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, input.messageId))
      .limit(1);
    if (!existing) throw new NotFoundException("Message not found");
    await this.membership.requireMember(existing.chatId, userId);

    await this.db
      .insert(messageReceipts)
      .values({
        messageId: input.messageId,
        userId,
        deviceId,
        status: input.status,
        at: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          messageReceipts.messageId,
          messageReceipts.userId,
          messageReceipts.deviceId,
          messageReceipts.status,
        ],
        set: { at: new Date() },
      });

    await this.bus.publish({
      type: "receipt.updated",
      chatId: existing.chatId,
      messageId: input.messageId,
      userId,
      status: input.status,
    });
    return { ok: true };
  }

  private async nextSeq(chatId: string): Promise<number> {
    const [row] = await this.db
      .update(chatSequences)
      .set({ nextSeq: sql`${chatSequences.nextSeq} + 1` })
      .where(eq(chatSequences.chatId, chatId))
      .returning({ nextSeq: chatSequences.nextSeq });

    if (!row) {
      await this.db.insert(chatSequences).values({ chatId, nextSeq: 2 });
      return 1;
    }
    return Number(row.nextSeq) - 1;
  }

  private toMessage(row: typeof messages.$inferSelect, clientId?: string): Message {
    const header = row.ratchetHeader as {
      algorithm?: string;
      header?: string;
      senderDeviceId?: string;
    } | null;

    return {
      id: row.id,
      chatId: row.chatId,
      senderId: row.senderId,
      senderDeviceId: row.senderDeviceId,
      serverSeq: Number(row.serverSeq),
      contentType: row.contentType as Message["contentType"],
      envelope: {
        algorithm: header?.algorithm ?? "unknown",
        header: header?.header ?? row.nonce ?? "",
        ciphertext: row.ciphertext,
        senderDeviceId: header?.senderDeviceId ?? row.senderDeviceId,
      },
      replyToId: row.replyToId,
      forwardedFromId: row.forwardedFromId,
      clientId,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt ? row.editedAt.toISOString() : null,
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      pinnedAt: row.pinnedAt ? row.pinnedAt.toISOString() : null,
    };
  }
}
