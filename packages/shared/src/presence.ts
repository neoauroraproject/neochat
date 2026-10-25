import { z } from "zod";
import { isoDate, uuid } from "./common.js";

export const PresenceStatusSchema = z.enum(["online", "offline", "away"]);
export type PresenceStatus = z.infer<typeof PresenceStatusSchema>;

export const UserPresenceSchema = z.object({
  userId: uuid,
  online: z.boolean(),
  status: PresenceStatusSchema.optional(),
  lastSeenAt: isoDate.nullable(),
});
export type UserPresence = z.infer<typeof UserPresenceSchema>;

export const TypingEventSchema = z.object({
  chatId: uuid,
  userId: uuid,
});
export type TypingEvent = z.infer<typeof TypingEventSchema>;

export const TypingStartEventSchema = TypingEventSchema.extend({
  type: z.literal("typing.start"),
});
export type TypingStartEvent = z.infer<typeof TypingStartEventSchema>;

export const TypingStopEventSchema = TypingEventSchema.extend({
  type: z.literal("typing.stop"),
});
export type TypingStopEvent = z.infer<typeof TypingStopEventSchema>;

export const PresenceUpdatedEventSchema = z.object({
  type: z.literal("presence.updated"),
  userId: uuid,
  online: z.boolean(),
  lastSeenAt: isoDate,
});
export type PresenceUpdatedEvent = z.infer<typeof PresenceUpdatedEventSchema>;

export const HeartbeatResponseSchema = z.object({
  online: z.literal(true),
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponseSchema>;
