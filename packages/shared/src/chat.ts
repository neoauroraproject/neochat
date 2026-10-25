import { z } from "zod";
import { isoDate, uuid } from "./common.js";
import { PublicUserSchema } from "./user.js";

export const ChatTypeSchema = z.enum(["dm", "group", "channel"]);
export type ChatType = z.infer<typeof ChatTypeSchema>;

export const ChatMemberRoleSchema = z.enum(["owner", "admin", "member", "moderator"]);
export type ChatMemberRole = z.infer<typeof ChatMemberRoleSchema>;

export const ChatPermissionSchema = z.enum([
  "send_messages",
  "edit_own_messages",
  "delete_own_messages",
  "delete_any_message",
  "pin_messages",
  "manage_members",
  "manage_chat",
  "moderate",
  "post_in_readonly_channel",
]);
export type ChatPermission = z.infer<typeof ChatPermissionSchema>;

/** Permissions granted to each member role within a chat. */
export const ROLE_PERMISSIONS: Readonly<Record<ChatMemberRole, readonly ChatPermission[]>> = {
  owner: [
    "send_messages",
    "edit_own_messages",
    "delete_own_messages",
    "delete_any_message",
    "pin_messages",
    "manage_members",
    "manage_chat",
    "moderate",
    "post_in_readonly_channel",
  ],
  admin: [
    "send_messages",
    "edit_own_messages",
    "delete_own_messages",
    "delete_any_message",
    "pin_messages",
    "manage_members",
    "manage_chat",
    "moderate",
    "post_in_readonly_channel",
  ],
  moderator: [
    "send_messages",
    "edit_own_messages",
    "delete_own_messages",
    "delete_any_message",
    "pin_messages",
    "moderate",
    "post_in_readonly_channel",
  ],
  member: ["send_messages", "edit_own_messages", "delete_own_messages"],
};

export function roleHasPermission(role: ChatMemberRole, permission: ChatPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canPostInReadonlyChannel(role: ChatMemberRole): boolean {
  return roleHasPermission(role, "post_in_readonly_channel");
}

export const ChatSchema = z.object({
  id: uuid,
  type: ChatTypeSchema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isReadonly: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Chat = z.infer<typeof ChatSchema>;

export const ChatMemberSchema = z.object({
  chatId: uuid,
  userId: uuid,
  role: ChatMemberRoleSchema.default("member"),
  mutedUntil: isoDate.nullable().optional(),
  lastReadSeq: z.number().int().nonnegative(),
  joinedAt: isoDate,
  user: PublicUserSchema.optional(),
});
export type ChatMember = z.infer<typeof ChatMemberSchema>;

export const CreateDmRequestSchema = z.object({
  peerUserId: uuid,
});
export type CreateDmRequest = z.infer<typeof CreateDmRequestSchema>;

export const CreateGroupRequestSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  memberIds: z.array(uuid).min(1),
  avatarUrl: z.string().url().optional(),
});
export type CreateGroupRequest = z.infer<typeof CreateGroupRequestSchema>;

export const CreateChannelRequestSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  isReadonly: z.boolean().default(true),
  memberIds: z.array(uuid).optional(),
});
export type CreateChannelRequest = z.infer<typeof CreateChannelRequestSchema>;

/** Unified create request used by POST /chats. */
export const CreateChatRequestSchema = z.object({
  type: ChatTypeSchema,
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  memberIds: z.array(uuid).min(1),
});
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>;

export const UpdateChatRequestSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  isReadonly: z.boolean().optional(),
});
export type UpdateChatRequest = z.infer<typeof UpdateChatRequestSchema>;

export const AddMemberRequestSchema = z.object({
  userId: uuid,
  role: ChatMemberRoleSchema.default("member"),
});
export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

export const AddMembersRequestSchema = z.object({
  memberIds: z.array(uuid).min(1),
});
export type AddMembersRequest = z.infer<typeof AddMembersRequestSchema>;

export const UpdateMemberRoleRequestSchema = z.object({
  role: ChatMemberRoleSchema,
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

export const MarkReadRequestSchema = z.object({
  lastReadSeq: z.number().int().nonnegative(),
});
export type MarkReadRequest = z.infer<typeof MarkReadRequestSchema>;

export const DraftSchema = z.object({
  chatId: uuid,
  ciphertext: z.string(),
  updatedAt: isoDate,
});
export type Draft = z.infer<typeof DraftSchema>;

export const UpsertDraftRequestSchema = z.object({
  ciphertext: z.string().min(1),
});
export type UpsertDraftRequest = z.infer<typeof UpsertDraftRequestSchema>;
