import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { HealthCheckResult } from "../health.js";
import type {
  CallProvider,
  CallPublishSource,
  CallRoomInfo,
  CreateParticipantTokenOptions,
  ParticipantTokenGrant,
} from "./call.provider.js";

export interface LiveKitCallProviderConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

function toTrackSources(sources: CallPublishSource[] | undefined): TrackSource[] | undefined {
  if (!sources?.length) return undefined;
  const map: Record<CallPublishSource, TrackSource> = {
    camera: TrackSource.CAMERA,
    microphone: TrackSource.MICROPHONE,
    screen_share: TrackSource.SCREEN_SHARE,
  };
  return sources.map((s) => map[s]);
}

export class LiveKitCallProvider implements CallProvider {
  readonly name = "livekit";
  private readonly client: RoomServiceClient;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly url: string;

  constructor(config: LiveKitCallProviderConfig) {
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    const httpUrl = config.url.replace(/^ws(s?):\/\//, "http$1://");
    this.client = new RoomServiceClient(httpUrl, config.apiKey, config.apiSecret);
  }

  async createRoom(roomName: string): Promise<void> {
    await this.client.createRoom({ name: roomName, emptyTimeout: 300, maxParticipants: 50 });
  }

  async deleteRoom(roomName: string): Promise<void> {
    await this.client.deleteRoom(roomName);
  }

  async createParticipantToken(
    options: CreateParticipantTokenOptions,
    ttlSeconds: number,
  ): Promise<ParticipantTokenGrant> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: options.identity,
      name: options.name,
      ttl: ttlSeconds,
    });
    at.addGrant({
      roomJoin: true,
      room: options.room,
      canPublish: options.canPublish ?? true,
      canSubscribe: options.canSubscribe ?? true,
      canPublishData: options.canPublishData ?? true,
      canPublishSources: toTrackSources(options.canPublishSources),
    });
    const token = await at.toJwt();
    return {
      room: options.room,
      token,
      url: this.url,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async health(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.client.listRooms();
      return { status: "ok", latencyMs: Date.now() - start };
    } catch (err) {
      return { status: "down", detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async listRooms(): Promise<CallRoomInfo[]> {
    const rooms = await this.client.listRooms();
    return rooms.map((room) => ({
      name: room.name,
      numParticipants: room.numParticipants,
      creationTime: room.creationTime ? new Date(Number(room.creationTime) * 1000) : undefined,
    }));
  }
}
