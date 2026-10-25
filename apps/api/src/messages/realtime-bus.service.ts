import { Injectable } from "@nestjs/common";
import type { Redis as RedisClient } from "ioredis";
import type { CallInvite, CallSession } from "@neochat/shared";
import type { Message } from "@neochat/shared";

export type RealtimeEvent =
  | { type: "message.created"; chatId: string; message: Message }
  | { type: "message.updated"; chatId: string; message: Message }
  | { type: "message.deleted"; chatId: string; messageId: string }
  | { type: "typing.start"; chatId: string; userId: string }
  | { type: "typing.stop"; chatId: string; userId: string }
  | { type: "receipt.updated"; chatId: string; messageId: string; userId: string; status: string }
  | { type: "presence.updated"; userId: string; online: boolean; lastSeenAt: string | null }
  | {
      type: "call.invite";
      callId: string;
      chatId: string;
      targetUserId: string;
      invite: CallInvite;
    }
  | { type: "call.accept"; callId: string; chatId: string; userId: string; session: CallSession }
  | { type: "call.reject"; callId: string; chatId: string; userId: string }
  | {
      type: "call.end";
      callId: string;
      chatId: string;
      userId: string;
      reason: string;
      session: CallSession;
    }
  | {
      type: "call.participant-joined";
      callId: string;
      chatId: string;
      userId: string;
      displayName?: string;
    };

/** @deprecated Use RealtimeEvent */
export type MessageEvent = RealtimeEvent;

@Injectable()
export class RealtimeBusService {
  private readonly localHandlers = new Set<(event: MessageEvent) => void>();
  private redisSubscribed = false;
  private redisPublisher: RedisClient | null = null;
  private redisSubscriber: RedisClient | null = null;

  registerLocal(handler: (event: RealtimeEvent) => void): () => void {
    this.localHandlers.add(handler);
    return () => this.localHandlers.delete(handler);
  }

  async initRedis(redis: RedisClient): Promise<void> {
    if (this.redisSubscribed) return;
    this.redisPublisher = redis;
    const sub = redis.duplicate();
    this.redisSubscriber = sub;
    await sub.subscribe("neochat:events");
    sub.on("message", (_channel, payload) => {
      try {
        const event = JSON.parse(payload) as RealtimeEvent;
        this.dispatchLocal(event);
      } catch {
        // Ignore malformed payloads.
      }
    });
    this.redisSubscribed = true;
  }

  async publish(event: RealtimeEvent): Promise<void> {
    this.dispatchLocal(event);
    if (this.redisPublisher) {
      await this.redisPublisher.publish("neochat:events", JSON.stringify(event));
    }
  }

  private dispatchLocal(event: RealtimeEvent): void {
    for (const handler of this.localHandlers) {
      handler(event);
    }
  }
}
