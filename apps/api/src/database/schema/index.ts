import { relations, sql } from "drizzle-orm";

import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const now = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// ---------------------------------------------------------------------------

// Users & auth

// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",

  {
    id: uuid("id").primaryKey().defaultRandom(),

    username: text("username").notNull(),

    displayName: text("display_name").notNull(),

    avatarUrl: text("avatar_url"),

    bio: text("bio"),

    role: text("role").notNull().default("user"), // user | admin

    status: text("status").notNull().default("active"), // active | suspended | deleted

    locale: text("locale").notNull().default("en"),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

    createdAt: now(),

    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },

  (t) => ({
    usernameUnique: uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
  }),
);

export const credentials = pgTable("credentials", {
  userId: uuid("user_id")
    .primaryKey()

    .references(() => users.id, { onDelete: "cascade" }),

  passwordHash: text("password_hash").notNull(),

  algorithm: text("algorithm").notNull().default("argon2id"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()

    .references(() => users.id, { onDelete: "cascade" }),

  name: text("name").notNull().default("Unknown device"),

  publicKey: text("public_key"),

  trustedAt: timestamp("trusted_at", { withTimezone: true }),

  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

  createdAt: now(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()

    .references(() => users.id, { onDelete: "cascade" }),

  deviceId: uuid("device_id")
    .notNull()

    .references(() => devices.id, { onDelete: "cascade" }),

  ip: text("ip"),

  userAgent: text("user_agent"),

  revokedAt: timestamp("revoked_at", { withTimezone: true }),

  createdAt: now(),

  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),

  sessionId: uuid("session_id")
    .notNull()

    .references(() => sessions.id, { onDelete: "cascade" }),

  tokenHash: text("token_hash").notNull(),

  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

  usedAt: timestamp("used_at", { withTimezone: true }),

  revokedAt: timestamp("revoked_at", { withTimezone: true }),

  createdAt: now(),
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),

  code: text("code").notNull().unique(),

  createdBy: uuid("created_by")
    .notNull()

    .references(() => users.id, { onDelete: "cascade" }),

  maxUses: integer("max_uses").notNull().default(1),

  uses: integer("uses").notNull().default(0),

  expiresAt: timestamp("expires_at", { withTimezone: true }),

  revokedAt: timestamp("revoked_at", { withTimezone: true }),

  createdAt: now(),
});

// ---------------------------------------------------------------------------

// Admin, audit, config

// ---------------------------------------------------------------------------

export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),

  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),

  action: text("action").notNull(),

  targetType: text("target_type"),

  targetId: text("target_id"),

  metadata: jsonb("metadata"),

  ip: text("ip"),

  createdAt: now(),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),

  value: jsonb("value").notNull(),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const retentionPolicies = pgTable("retention_policies", {
  id: uuid("id").primaryKey().defaultRandom(),

  scope: text("scope").notNull(), // audit | sessions | logs

  chatType: text("chat_type").notNull().default("all"),

  maxAgeDays: integer("max_age_days"),

  enabled: boolean("enabled").notNull().default(false),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),

  enabled: boolean("enabled").notNull().default(false),

  description: text("description"),

  rolloutPercentage: integer("rollout_percentage").notNull().default(100),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const configEntries = pgTable(
  "config_entries",

  {
    category: text("category").notNull(),

    key: text("key").notNull(),

    value: jsonb("value").notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },

  (t) => ({ pk: primaryKey({ columns: [t.category, t.key] }) }),
);

// ---------------------------------------------------------------------------

// Relations

// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many, one }) => ({
  credential: one(credentials, { fields: [users.id], references: [credentials.userId] }),

  devices: many(devices),
}));

export type UserRow = typeof users.$inferSelect;

export type NewUserRow = typeof users.$inferInsert;

export type DeviceRow = typeof devices.$inferSelect;

export type SessionRow = typeof sessions.$inferSelect;

export type InviteRow = typeof invites.$inferSelect;

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(), // dm | group | channel
  title: text("title"),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isReadonly: boolean("is_readonly").notNull().default(false),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | admin | member | moderator
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    lastReadSeq: bigint("last_read_seq", { mode: "number" }).notNull().default(0),
    joinedAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.chatId, t.userId] }),
  }),
);

export const chatSequences = pgTable("chat_sequences", {
  chatId: uuid("chat_id")
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  nextSeq: bigint("next_seq", { mode: "number" }).notNull().default(1),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderDeviceId: uuid("sender_device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    serverSeq: bigint("server_seq", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(), // text | media | system
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce"),
    ratchetHeader: jsonb("ratchet_header"),
    replyToId: uuid("reply_to_id"),
    forwardedFromId: uuid("forwarded_from_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({
    chatSeqUnique: uniqueIndex("messages_chat_seq_unique").on(t.chatId, t.serverSeq),
  }),
);

export const reactions = pgTable(
  "reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.userId, t.emoji] }),
  }),
);

export const messageReceipts = pgTable(
  "message_receipts",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // delivered | read
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.userId, t.deviceId, t.status] }),
  }),
);

export const deviceKeys = pgTable("device_keys", {
  deviceId: uuid("device_id")
    .primaryKey()
    .references(() => devices.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  identityKey: text("identity_key").notNull(),
  signingKey: text("signing_key").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const signedPrekeys = pgTable(
  "signed_prekeys",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    keyId: integer("key_id").notNull(),
    publicKey: text("public_key").notNull(),
    signature: text("signature").notNull(),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.deviceId, t.keyId] }),
  }),
);

export const oneTimePrekeys = pgTable(
  "one_time_prekeys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    keyId: integer("key_id").notNull(),
    publicKey: text("public_key").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({
    deviceKeyUnique: uniqueIndex("one_time_prekeys_device_key_unique").on(t.deviceId, t.keyId),
  }),
);

export const mediaObjects = pgTable("media_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  uploaderId: uuid("uploader_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  mimeDeclared: text("mime_declared").notNull(),
  sha256Ciphertext: text("sha256_ciphertext").notNull(),
  kind: text("kind").notNull(), // image | video | audio | file
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: now(),
});

export const drafts = pgTable(
  "drafts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.chatId] }),
  }),
);

export type ChatRow = typeof chats.$inferSelect;
export type ChatMemberRow = typeof chatMembers.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type MediaObjectRow = typeof mediaObjects.$inferSelect;

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export const callSessions = pgTable("call_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  roomName: text("room_name").notNull(),
  initiatedBy: uuid("initiated_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  video: boolean("video").notNull().default(false),
  screenShareEnabled: boolean("screen_share_enabled").notNull().default(false),
  status: text("status").notNull().default("ringing"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  participants: jsonb("participants").notNull().default([]),
  createdAt: now(),
});

export const callHistory = pgTable("call_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  callSessionId: uuid("call_session_id")
    .notNull()
    .references(() => callSessions.id, { onDelete: "cascade" }),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  roomName: text("room_name").notNull(),
  initiatedBy: uuid("initiated_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  video: boolean("video").notNull(),
  screenShareEnabled: boolean("screen_share_enabled").notNull().default(false),
  durationSeconds: integer("duration_seconds"),
  participants: jsonb("participants").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  createdAt: now(),
});

export type CallSessionRow = typeof callSessions.$inferSelect;
export type CallHistoryRow = typeof callHistory.$inferSelect;
