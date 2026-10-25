import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  EditMessageRequestSchema,
  ForwardMessageRequestSchema,
  ReactRequestSchema,
  ReadReceiptRequestSchema,
  SendMessageRequestSchema,
  type EditMessageRequest,
  type ForwardMessageRequest,
  type ReactRequest,
  type ReadReceiptRequest,
  type SendMessageRequest,
} from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type MessagesService } from "./messages.service.js";

@Controller()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get("chats/:chatId/messages")
  list(
    @CurrentUser("sub") userId: string,
    @Param("chatId") chatId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedCursor = cursor ? Number(cursor) : undefined;
    const parsedLimit = limit ? Number(limit) : 30;
    return this.messages.list(chatId, userId, parsedCursor, parsedLimit);
  }

  @Post("messages")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  send(
    @CurrentUser("sub") userId: string,
    @CurrentUser("did") deviceId: string,
    @Body(new ZodValidationPipe(SendMessageRequestSchema)) body: SendMessageRequest,
  ) {
    return this.messages.send(userId, deviceId, body);
  }

  @Patch("messages/:id")
  edit(
    @CurrentUser("sub") userId: string,
    @Param("id") messageId: string,
    @Body(new ZodValidationPipe(EditMessageRequestSchema)) body: EditMessageRequest,
  ) {
    return this.messages.edit(messageId, userId, body);
  }

  @Delete("messages/:id")
  remove(@CurrentUser("sub") userId: string, @Param("id") messageId: string) {
    return this.messages.remove(messageId, userId);
  }

  @Post("messages/:id/forward")
  forward(
    @CurrentUser("sub") userId: string,
    @CurrentUser("did") deviceId: string,
    @Param("id") messageId: string,
    @Body(new ZodValidationPipe(ForwardMessageRequestSchema)) body: ForwardMessageRequest,
  ) {
    return this.messages.forward(messageId, userId, deviceId, body);
  }

  @Post("messages/:id/reactions")
  react(
    @CurrentUser("sub") userId: string,
    @Param("id") messageId: string,
    @Body(new ZodValidationPipe(ReactRequestSchema)) body: ReactRequest,
  ) {
    return this.messages.react(messageId, userId, body);
  }

  @Delete("messages/:id/reactions/:emoji")
  unreact(
    @CurrentUser("sub") userId: string,
    @Param("id") messageId: string,
    @Param("emoji") emoji: string,
  ) {
    return this.messages.unreact(messageId, userId, decodeURIComponent(emoji));
  }

  @Post("messages/receipts")
  receipt(
    @CurrentUser("sub") userId: string,
    @CurrentUser("did") deviceId: string,
    @Body(new ZodValidationPipe(ReadReceiptRequestSchema)) body: ReadReceiptRequest,
  ) {
    return this.messages.recordReceipt(userId, deviceId, body);
  }
}
