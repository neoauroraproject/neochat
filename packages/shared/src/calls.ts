import { z } from "zod";
import { isoDate, uuid } from "./common.js";

export const CallStatusSchema = z.enum(["ringing", "active", "ended"]);
export type CallStatus = z.infer<typeof CallStatusSchema>;

export const CallParticipantSchema = z.object({
  userId: uuid,
  displayName: z.string().optional(),
  joinedAt: isoDate.optional(),
  leftAt: isoDate.optional(),
});
export type CallParticipant = z.infer<typeof CallParticipantSchema>;

export const CreateCallRequestSchema = z.object({
  chatId: uuid,
  video: z.boolean(),
  screenShareReady: z.boolean().optional(),
});
export type CreateCallRequest = z.infer<typeof CreateCallRequestSchema>;

export const CallSessionSchema = z.object({
  id: uuid,
  chatId: uuid,
  roomName: z.string(),
  initiatedBy: uuid,
  video: z.boolean(),
  screenShareEnabled: z.boolean(),
  status: CallStatusSchema,
  startedAt: isoDate.nullable(),
  endedAt: isoDate.nullable(),
  participants: z.array(CallParticipantSchema),
  createdAt: isoDate,
});
export type CallSession = z.infer<typeof CallSessionSchema>;

export const CallInviteSchema = z.object({
  callId: uuid,
  chatId: uuid,
  initiatedBy: uuid,
  initiatorName: z.string(),
  video: z.boolean(),
  screenShareEnabled: z.boolean(),
});
export type CallInvite = z.infer<typeof CallInviteSchema>;

export const CallHistoryEntrySchema = z.object({
  id: uuid,
  callSessionId: uuid,
  chatId: uuid,
  roomName: z.string(),
  initiatedBy: uuid,
  video: z.boolean(),
  screenShareEnabled: z.boolean(),
  durationSeconds: z.number().int().nullable(),
  participants: z.array(CallParticipantSchema),
  startedAt: isoDate.nullable(),
  endedAt: isoDate,
  createdAt: isoDate,
});
export type CallHistoryEntry = z.infer<typeof CallHistoryEntrySchema>;

export const EndCallRequestSchema = z.object({
  reason: z.string().max(200).optional(),
});
export type EndCall = z.infer<typeof EndCallRequestSchema>;

export const AcceptCallRequestSchema = z.object({
  video: z.boolean().optional(),
});
export type AcceptCall = z.infer<typeof AcceptCallRequestSchema>;

export const DevicePreferencesSchema = z.object({
  defaultMicId: z.string().nullable(),
  defaultCamId: z.string().nullable(),
});
export type DevicePreferences = z.infer<typeof DevicePreferencesSchema>;

export const CallTokenResponseSchema = z.object({
  callId: uuid,
  roomName: z.string(),
  token: z.string(),
  url: z.string(),
  expiresAt: isoDate,
});
export type CallTokenResponse = z.infer<typeof CallTokenResponseSchema>;

export const CallDevicesMetaSchema = z.object({
  flags: z.object({
    voice: z.boolean(),
    video: z.boolean(),
    screenShare: z.boolean(),
  }),
  provider: z.string(),
  preferences: DevicePreferencesSchema,
});
export type CallDevicesMeta = z.infer<typeof CallDevicesMetaSchema>;

export const CallParticipantJoinedEventSchema = z.object({
  callId: uuid,
  chatId: uuid,
  userId: uuid,
  displayName: z.string().optional(),
});
export type CallParticipantJoinedEvent = z.infer<typeof CallParticipantJoinedEventSchema>;
