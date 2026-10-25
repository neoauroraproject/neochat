import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { type JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtAccessClaimsSchema } from "@neochat/shared";
import type { Server, Socket } from "socket.io";
import { type ConfigurationService } from "../config/configuration.service.js";
import { REDIS } from "../redis/redis.module.js";
import type { Redis as RedisClient } from "ioredis";
import { type RealtimeBusService } from "./realtime-bus.service.js";

interface AuthedSocket extends Socket {
  userId?: string;
  deviceId?: string;
}

@WebSocketGateway({ namespace: "/ws", cors: { origin: "*" } })
@Injectable()
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(MessagesGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigurationService,
    private readonly bus: RealtimeBusService,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.redis.connect().catch(() => undefined);
    await this.bus.initRedis(this.redis);
    this.bus.registerLocal((event) => this.fanOut(event));
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization?.split(" ")[1] as string | undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.cfg.env.JWT_ACCESS_SECRET,
      });
      const claims = JwtAccessClaimsSchema.parse(payload);
      client.userId = claims.sub;
      client.deviceId = claims.did;
      client.join(`user:${claims.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    if (client.userId) {
      void this.bus.publish({
        type: "presence.updated",
        userId: client.userId,
        online: false,
        lastSeenAt: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage("chat.join")
  async joinChat(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { chatId: string }) {
    if (!client.userId) return { ok: false };
    client.join(`chat:${data.chatId}`);
    return { ok: true };
  }

  @SubscribeMessage("chat.leave")
  async leaveChat(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    client.leave(`chat:${data.chatId}`);
    return { ok: true };
  }

  @SubscribeMessage("typing.start")
  async typingStart(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    if (!client.userId) return;
    await this.bus.publish({
      type: "typing.start",
      chatId: data.chatId,
      userId: client.userId,
    });
  }

  @SubscribeMessage("typing.stop")
  async typingStop(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() data: { chatId: string },
  ) {
    if (!client.userId) return;
    await this.bus.publish({
      type: "typing.stop",
      chatId: data.chatId,
      userId: client.userId,
    });
  }

  private fanOut(event: Parameters<RealtimeBusService["publish"]>[0]): void {
    switch (event.type) {
      case "message.created":
      case "message.updated":
        this.server.to(`chat:${event.chatId}`).emit(event.type, event.message);
        break;
      case "message.deleted":
        this.server.to(`chat:${event.chatId}`).emit(event.type, { messageId: event.messageId });
        break;
      case "typing.start":
      case "typing.stop":
        this.server
          .to(`chat:${event.chatId}`)
          .except(`user:${event.userId}`)
          .emit(event.type, { chatId: event.chatId, userId: event.userId });
        break;
      case "receipt.updated":
        this.server.to(`chat:${event.chatId}`).emit(event.type, {
          messageId: event.messageId,
          userId: event.userId,
          status: event.status,
        });
        break;
      case "presence.updated":
        this.server.emit(event.type, {
          userId: event.userId,
          online: event.online,
          lastSeenAt: event.lastSeenAt,
        });
        break;
      case "call.invite":
        this.server.to(`user:${event.targetUserId}`).emit("call.invite", event.invite);
        break;
      case "call.accept":
        this.server.to(`chat:${event.chatId}`).emit("call.accept", {
          callId: event.callId,
          userId: event.userId,
          session: event.session,
        });
        break;
      case "call.reject":
        this.server.to(`chat:${event.chatId}`).emit("call.reject", {
          callId: event.callId,
          userId: event.userId,
        });
        break;
      case "call.end":
        this.server.to(`chat:${event.chatId}`).emit("call.end", {
          callId: event.callId,
          userId: event.userId,
          reason: event.reason,
          session: event.session,
        });
        break;
      case "call.participant-joined":
        this.server.to(`chat:${event.chatId}`).emit("call.participant-joined", {
          callId: event.callId,
          userId: event.userId,
          displayName: event.displayName,
        });
        break;
      default:
        this.logger.debug(`Unhandled event ${(event as { type: string }).type}`);
    }
  }
}
