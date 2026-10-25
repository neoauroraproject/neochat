import type { HealthCheckResult } from "../health.js";

export type CallPublishSource = "camera" | "microphone" | "screen_share";

export interface CreateParticipantTokenOptions {
  room: string;
  identity: string;
  name?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canPublishSources?: CallPublishSource[];
}

export interface ParticipantTokenGrant {
  room: string;
  token: string;
  url: string;
  expiresAt: Date;
}

export interface CallRoomInfo {
  name: string;
  numParticipants: number;
  creationTime?: Date;
}

/** Abstraction over an SFU / call backend. */
export interface CallProvider {
  readonly name: string;
  createRoom(roomName: string): Promise<void>;
  deleteRoom(roomName: string): Promise<void>;
  createParticipantToken(
    options: CreateParticipantTokenOptions,
    ttlSeconds: number,
  ): Promise<ParticipantTokenGrant>;
  health(): Promise<HealthCheckResult>;
  listRooms?(): Promise<CallRoomInfo[]>;
}

/** Phase 2 noop adapter — calls disabled until LiveKit is configured. */
export class NoopCallProvider implements CallProvider {
  readonly name = "noop";

  async createRoom(_roomName: string): Promise<void> {}

  async deleteRoom(_roomName: string): Promise<void> {}

  async createParticipantToken(
    options: CreateParticipantTokenOptions,
    ttlSeconds: number,
  ): Promise<ParticipantTokenGrant> {
    return {
      room: options.room,
      token: "noop",
      url: "noop://calls",
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async health(): Promise<HealthCheckResult> {
    return { status: "ok", detail: "noop provider" };
  }

  async listRooms(): Promise<CallRoomInfo[]> {
    return [];
  }
}
