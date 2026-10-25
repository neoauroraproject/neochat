import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UsePipes } from "@nestjs/common";
import {
  AddMembersRequestSchema,
  CreateChatRequestSchema,
  MarkReadRequestSchema,
  UpdateChatRequestSchema,
  UpdateMemberRoleRequestSchema,
  UpsertDraftRequestSchema,
  type AddMembersRequest,
  type CreateChatRequest,
  type MarkReadRequest,
  type UpdateChatRequest,
  type UpdateMemberRoleRequest,
  type UpsertDraftRequest,
} from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type ChatsService } from "./chats.service.js";

@Controller("chats")
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  list(@CurrentUser("sub") userId: string) {
    return this.chats.list(userId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateChatRequestSchema))
  create(@CurrentUser("sub") userId: string, @Body() body: CreateChatRequest) {
    return this.chats.create(userId, body);
  }

  @Get(":id")
  get(@CurrentUser("sub") userId: string, @Param("id") chatId: string) {
    return this.chats.get(chatId, userId);
  }

  @Patch(":id")
  update(
    @CurrentUser("sub") userId: string,
    @Param("id") chatId: string,
    @Body(new ZodValidationPipe(UpdateChatRequestSchema)) body: UpdateChatRequest,
  ) {
    return this.chats.update(chatId, userId, body);
  }

  @Get(":id/members")
  members(@CurrentUser("sub") userId: string, @Param("id") chatId: string) {
    return this.chats.listMembers(chatId, userId);
  }

  @Post(":id/members")
  addMembers(
    @CurrentUser("sub") userId: string,
    @Param("id") chatId: string,
    @Body(new ZodValidationPipe(AddMembersRequestSchema)) body: AddMembersRequest,
  ) {
    return this.chats.addMembers(chatId, userId, body);
  }

  @Patch(":id/members/:userId")
  updateMemberRole(
    @CurrentUser("sub") actorId: string,
    @Param("id") chatId: string,
    @Param("userId") targetUserId: string,
    @Body(new ZodValidationPipe(UpdateMemberRoleRequestSchema)) body: UpdateMemberRoleRequest,
  ) {
    return this.chats.updateMemberRole(chatId, actorId, targetUserId, body);
  }

  @Post(":id/join")
  join(@CurrentUser("sub") userId: string, @Param("id") chatId: string) {
    return this.chats.join(chatId, userId);
  }

  @Post(":id/leave")
  leave(@CurrentUser("sub") userId: string, @Param("id") chatId: string) {
    return this.chats.leave(chatId, userId);
  }

  @Post(":id/read")
  markRead(
    @CurrentUser("sub") userId: string,
    @Param("id") chatId: string,
    @Body(new ZodValidationPipe(MarkReadRequestSchema)) body: MarkReadRequest,
  ) {
    return this.chats.markRead(chatId, userId, body);
  }

  @Post(":id/messages/:messageId/pin")
  pinMessage(
    @CurrentUser("sub") userId: string,
    @Param("id") chatId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.chats.pinMessage(chatId, userId, messageId);
  }

  @Delete(":id/messages/:messageId/pin")
  unpinMessage(
    @CurrentUser("sub") userId: string,
    @Param("id") chatId: string,
    @Param("messageId") messageId: string,
  ) {
    return this.chats.unpinMessage(chatId, userId, messageId);
  }

  @Get(":id/draft")
  getDraft(@CurrentUser("sub") userId: string, @Param("id") chatId: string) {
    return this.chats.getDraft(chatId, userId);
  }

  @Put(":id/draft")
  upsertDraft(
    @CurrentUser("sub") userId: string,
    @Param("id") chatId: string,
    @Body(new ZodValidationPipe(UpsertDraftRequestSchema)) body: UpsertDraftRequest,
  ) {
    return this.chats.upsertDraft(chatId, userId, body.ciphertext);
  }

  @Delete(":id/draft")
  deleteDraft(@CurrentUser("sub") userId: string, @Param("id") chatId: string) {
    return this.chats.deleteDraft(chatId, userId);
  }
}
