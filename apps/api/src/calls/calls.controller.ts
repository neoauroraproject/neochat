import { Body, Controller, Get, Param, Post, Query, UsePipes } from "@nestjs/common";
import {
  AcceptCallRequestSchema,
  CreateCallRequestSchema,
  EndCallRequestSchema,
  type AcceptCall,
  type CreateCallRequest,
  type EndCall,
} from "@neochat/shared";
import { CurrentUser } from "../common/current-user.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { type CallsService } from "./calls.service.js";

@Controller("calls")
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Get("devices-meta")
  devicesMeta(@CurrentUser("sub") userId: string) {
    return this.calls.getDevicesMeta(userId);
  }

  @Get("history")
  history(@CurrentUser("sub") userId: string, @Query("chatId") chatId?: string) {
    return this.calls.history(userId, chatId);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateCallRequestSchema))
  create(@CurrentUser("sub") userId: string, @Body() body: CreateCallRequest) {
    return this.calls.create(userId, body);
  }

  @Get(":id/token")
  token(@CurrentUser("sub") userId: string, @Param("id") callId: string) {
    return this.calls.getToken(userId, callId);
  }

  @Post(":id/invite")
  invite(@CurrentUser("sub") userId: string, @Param("id") callId: string) {
    return this.calls.invite(userId, callId);
  }

  @Post(":id/accept")
  accept(
    @CurrentUser("sub") userId: string,
    @Param("id") callId: string,
    @Body(new ZodValidationPipe(AcceptCallRequestSchema)) body: AcceptCall,
  ) {
    return this.calls.accept(userId, callId, body);
  }

  @Post(":id/reject")
  reject(@CurrentUser("sub") userId: string, @Param("id") callId: string) {
    return this.calls.reject(userId, callId);
  }

  @Post(":id/end")
  end(
    @CurrentUser("sub") userId: string,
    @Param("id") callId: string,
    @Body(new ZodValidationPipe(EndCallRequestSchema)) body: EndCall,
  ) {
    return this.calls.end(userId, callId, body);
  }
}
