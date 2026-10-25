import { z } from "zod";
import { LocaleSchema, uuid, isoDate } from "./common.js";

export const UserRoleSchema = z.enum(["user", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(["active", "suspended", "deleted"]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const PublicUserSchema = z.object({
  id: uuid,
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const UserProfileSchema = PublicUserSchema.extend({
  role: UserRoleSchema,
  status: UserStatusSchema,
  locale: LocaleSchema,
  lastSeenAt: isoDate.nullable().optional(),
  online: z.boolean().optional(),
  createdAt: isoDate,
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const UpdateProfileRequestSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  bio: z.string().max(280).nullable().optional(),
  locale: LocaleSchema.optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

export const DeviceSchema = z.object({
  id: uuid,
  name: z.string(),
  publicKey: z.string().nullable(),
  lastSeenAt: isoDate.nullable(),
  createdAt: isoDate,
  current: z.boolean().default(false),
});
export type Device = z.infer<typeof DeviceSchema>;
