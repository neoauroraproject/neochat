import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AcceptCall,
  CallDevicesMeta,
  CallHistoryEntry,
  CallParticipant,
  CallSession,
  CallTokenResponse,
  CreateCallRequest,
  EndCall,
} from "@neochat/shared";
import type { CallProvider } from "@neochat/providers";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { type ConfigurationService } from "../config/configuration.service.js";
import type { Database } from "../database/drizzle.js";
import { callHistory, callSessions, chatMembers, users } from "../database/schema/index.js";
import { DRIZZLE } from "../database/tokens.js";
import { type FeatureFlagsService } from "../feature-flags/feature-flags.service.js";
import { type RealtimeBusService } from "../messages/realtime-bus.service.js";
import { CALL_PROVIDER } from "../providers/provider.tokens.js";
import { type ChatMembershipService } from "../chats/chat-membership.service.js";

type StoredParticipant = CallParticipant;

@Injectable()
export class CallsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CALL_PROVIDER) private readonly calls: CallProvider,
    private readonly cfg: ConfigurationService,
    private readonly flags: FeatureFlagsService,
    private readonly membership: ChatMembershipService,
    private readonly bus: RealtimeBusService,
  ) {}

  private assertCallsEnabled(userId: string): void {
    const callsCfg = this.cfg.get("calls");
    if (!callsCfg.enabled) {
      throw new ForbiddenException("Calls are disabled");
    }
    if (!this.flags.isEnabled("calls.voice", userId)) {
      throw new ForbiddenException("Voice calls are disabled");
    }
  }

  private assertVideoEnabled(userId: string): void {
    if (!this.flags.isEnabled("calls.video", userId)) {
      throw new ForbiddenException("Video calls are disabled");
    }
  }

  private assertScreenShareEnabled(userId: string): void {
    if (!this.flags.isEnabled("calls.screenShare", userId)) {
      throw new ForbiddenException("Screen sharing is disabled");
    }
  }

  getDevicesMeta(userId: string): CallDevicesMeta {
    return {
      flags: {
        voice: this.flags.isEnabled("calls.voice", userId),
        video: this.flags.isEnabled("calls.video", userId),
        screenShare: this.flags.isEnabled("calls.screenShare", userId),
      },
      provider: this.calls.name,
      preferences: {
        defaultMicId: null,
        defaultCamId: null,
      },
    };
  }

  async create(userId: string, body: CreateCallRequest): Promise<CallSession> {
    this.assertCallsEnabled(userId);
    if (body.video) this.assertVideoEnabled(userId);
    if (body.screenShareReady) this.assertScreenShareEnabled(userId);

    await this.membership.requireMember(body.chatId, userId);

    const active = await this.db
      .select()
      .from(callSessions)
      .where(
        and(
          eq(callSessions.chatId, body.chatId),
          inArray(callSessions.status, ["ringing", "active"]),
        ),
      )
      .limit(1);
    if (active.length > 0) {
      throw new BadRequestException("An active call already exists for this chat");
    }

    const roomName = `chat-${body.chatId}-${randomUUID()}`;
    await this.calls.createRoom(roomName).catch(() => undefined);

    const [initiator] = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const participants: StoredParticipant[] = [
      { userId, displayName: initiator?.displayName, joinedAt: new Date().toISOString() },
    ];

    const [row] = await this.db
      .insert(callSessions)
      .values({
        chatId: body.chatId,
        roomName,
        initiatedBy: userId,
        video: body.video,
        screenShareEnabled: body.screenShareReady ?? false,
        status: "ringing",
        participants,
      })
      .returning();

    const session = this.toSession(row!);
    await this.broadcastInvite(session, initiator?.displayName ?? "Unknown");
    return session;
  }

  async getToken(userId: string, callId: string): Promise<CallTokenResponse> {
    this.assertCallsEnabled(userId);
    const row = await this.getSessionOrThrow(callId);
    await this.membership.requireMember(row.chatId, userId);

    if (row.status === "ended") {
      throw new BadRequestException("Call has ended");
    }

    const [user] = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const ttl = this.cfg.get("calls").tokenTtlSeconds;
    const sources: ("camera" | "microphone" | "screen_share")[] = ["microphone"];
    if (row.video) sources.push("camera");
    if (row.screenShareEnabled) sources.push("screen_share");

    const grant = await this.calls.createParticipantToken(
      {
        room: row.roomName,
        identity: userId,
        name: user?.displayName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canPublishSources: sources,
      },
      ttl,
    );

    return {
      callId: row.id,
      roomName: grant.room,
      token: grant.token,
      url: grant.url,
      expiresAt: grant.expiresAt.toISOString(),
    };
  }

  async invite(userId: string, callId: string): Promise<{ ok: true }> {
    this.assertCallsEnabled(userId);
    const row = await this.getSessionOrThrow(callId);
    if (row.initiatedBy !== userId) {
      throw new ForbiddenException("Only the initiator can send invites");
    }
    await this.membership.requireMember(row.chatId, userId);

    const [initiator] = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await this.broadcastInvite(this.toSession(row), initiator?.displayName ?? "Unknown");
    return { ok: true };
  }

  async accept(userId: string, callId: string, body: AcceptCall): Promise<CallSession> {
    this.assertCallsEnabled(userId);
    const row = await this.getSessionOrThrow(callId);
    await this.membership.requireMember(row.chatId, userId);

    if (row.status === "ended") {
      throw new BadRequestException("Call has ended");
    }

    const wantsVideo = body.video ?? row.video;
    if (wantsVideo) this.assertVideoEnabled(userId);

    const participants = this.parseParticipants(row.participants);
    if (!participants.some((p) => p.userId === userId)) {
      const [user] = await this.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      participants.push({
        userId,
        displayName: user?.displayName,
        joinedAt: new Date().toISOString(),
      });
    }

    const now = new Date();
    const [updated] = await this.db
      .update(callSessions)
      .set({
        status: "active",
        startedAt: row.startedAt ?? now,
        participants,
      })
      .where(eq(callSessions.id, callId))
      .returning();

    const session = this.toSession(updated!);
    await this.bus.publish({
      type: "call.accept",
      callId,
      chatId: row.chatId,
      userId,
      session,
    });
    await this.bus.publish({
      type: "call.participant-joined",
      callId,
      chatId: row.chatId,
      userId,
      displayName: participants.find((p) => p.userId === userId)?.displayName,
    });
    return session;
  }

  async reject(userId: string, callId: string): Promise<{ ok: true }> {
    this.assertCallsEnabled(userId);
    const row = await this.getSessionOrThrow(callId);
    await this.membership.requireMember(row.chatId, userId);

    await this.bus.publish({
      type: "call.reject",
      callId,
      chatId: row.chatId,
      userId,
    });

    const members = await this.db
      .select({ userId: chatMembers.userId })
      .from(chatMembers)
      .where(eq(chatMembers.chatId, row.chatId));
    const participants = this.parseParticipants(row.participants);
    const acceptedOthers = participants.filter(
      (p) => p.userId !== row.initiatedBy && p.userId !== userId,
    );

    if (row.status === "ringing" && acceptedOthers.length === 0) {
      await this.endInternal(row, userId, "rejected");
    }
    return { ok: true };
  }

  async end(userId: string, callId: string, _body: EndCall): Promise<CallSession> {
    this.assertCallsEnabled(userId);
    const row = await this.getSessionOrThrow(callId);
    await this.membership.requireMember(row.chatId, userId);
    return this.endInternal(row, userId, "ended");
  }

  async history(userId: string, chatId?: string): Promise<CallHistoryEntry[]> {
    this.assertCallsEnabled(userId);

    const memberChatIds = await this.db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .where(eq(chatMembers.userId, userId));

    const allowed = new Set(memberChatIds.map((m) => m.chatId));
    if (chatId) {
      if (!allowed.has(chatId)) throw new ForbiddenException("Not a member of this chat");
    }

    if (allowed.size === 0) return [];

    const rows = chatId
      ? await this.db
          .select()
          .from(callHistory)
          .where(eq(callHistory.chatId, chatId))
          .orderBy(desc(callHistory.endedAt))
          .limit(50)
      : await this.db
          .select()
          .from(callHistory)
          .where(inArray(callHistory.chatId, [...allowed]))
          .orderBy(desc(callHistory.endedAt))
          .limit(50);

    return rows.map((row) => this.toHistoryEntry(row));
  }

  private async endInternal(
    row: typeof callSessions.$inferSelect,
    actorId: string,
    reason: string,
  ): Promise<CallSession> {
    if (row.status === "ended") {
      return this.toSession(row);
    }

    const endedAt = new Date();
    const startedAt = row.startedAt ?? row.createdAt;
    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
    const participants = this.parseParticipants(row.participants);

    const [updated] = await this.db
      .update(callSessions)
      .set({ status: "ended", endedAt })
      .where(eq(callSessions.id, row.id))
      .returning();

    await this.db.insert(callHistory).values({
      callSessionId: row.id,
      chatId: row.chatId,
      roomName: row.roomName,
      initiatedBy: row.initiatedBy,
      video: row.video,
      screenShareEnabled: row.screenShareEnabled,
      durationSeconds,
      participants,
      startedAt: row.startedAt,
      endedAt,
    });

    await this.calls.deleteRoom(row.roomName).catch(() => undefined);

    const session = this.toSession(updated!);
    await this.bus.publish({
      type: "call.end",
      callId: row.id,
      chatId: row.chatId,
      userId: actorId,
      reason,
      session,
    });
    return session;
  }

  private async broadcastInvite(session: CallSession, initiatorName: string): Promise<void> {
    const members = await this.db
      .select({ userId: chatMembers.userId })
      .from(chatMembers)
      .where(
        and(eq(chatMembers.chatId, session.chatId), ne(chatMembers.userId, session.initiatedBy)),
      );

    for (const member of members) {
      await this.bus.publish({
        type: "call.invite",
        callId: session.id,
        chatId: session.chatId,
        targetUserId: member.userId,
        invite: {
          callId: session.id,
          chatId: session.chatId,
          initiatedBy: session.initiatedBy,
          initiatorName,
          video: session.video,
          screenShareEnabled: session.screenShareEnabled,
        },
      });
    }
  }

  private async getSessionOrThrow(callId: string) {
    const [row] = await this.db
      .select()
      .from(callSessions)
      .where(eq(callSessions.id, callId))
      .limit(1);
    if (!row) throw new NotFoundException("Call not found");
    return row;
  }

  private parseParticipants(raw: unknown): StoredParticipant[] {
    if (!Array.isArray(raw)) return [];
    return raw as StoredParticipant[];
  }

  private toSession(row: typeof callSessions.$inferSelect): CallSession {
    return {
      id: row.id,
      chatId: row.chatId,
      roomName: row.roomName,
      initiatedBy: row.initiatedBy,
      video: row.video,
      screenShareEnabled: row.screenShareEnabled,
      status: row.status as CallSession["status"],
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt?.toISOString() ?? null,
      participants: this.parseParticipants(row.participants),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toHistoryEntry(row: typeof callHistory.$inferSelect): CallHistoryEntry {
    return {
      id: row.id,
      callSessionId: row.callSessionId,
      chatId: row.chatId,
      roomName: row.roomName,
      initiatedBy: row.initiatedBy,
      video: row.video,
      screenShareEnabled: row.screenShareEnabled,
      durationSeconds: row.durationSeconds,
      participants: this.parseParticipants(row.participants),
      startedAt: row.startedAt?.toISOString() ?? null,
      endedAt: row.endedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
