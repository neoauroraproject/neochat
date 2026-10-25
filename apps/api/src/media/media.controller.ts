import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  ConfirmMediaUploadRequestSchema,
  CreateMediaUploadRequestSchema,
  type ConfirmMediaUploadRequest,
  type CreateMediaUploadRequest,
} from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type MediaService } from "./media.service.js";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("uploads")
  createSlot(
    @CurrentUser("sub") userId: string,
    @Body(new ZodValidationPipe(CreateMediaUploadRequestSchema)) body: CreateMediaUploadRequest,
  ) {
    return this.media.createUploadSlot(userId, body);
  }

  @Post(":id/confirm")
  confirm(
    @CurrentUser("sub") userId: string,
    @Param("id") mediaObjectId: string,
    @Body(new ZodValidationPipe(ConfirmMediaUploadRequestSchema)) body: ConfirmMediaUploadRequest,
  ) {
    return this.media.confirm(userId, mediaObjectId, body);
  }

  @Get(":id/download")
  download(@CurrentUser("sub") userId: string, @Param("id") mediaObjectId: string) {
    return this.media.downloadUrl(userId, mediaObjectId);
  }
}
