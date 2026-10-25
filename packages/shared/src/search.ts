import { z } from "zod";
import { isoDate, uuid } from "./common.js";
import { ChatTypeSchema } from "./chat.js";
import { MessageContentTypeSchema } from "./message.js";
import { PublicUserSchema } from "./user.js";

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const ChatSearchHitSchema = z.object({
  id: uuid,
  type: ChatTypeSchema,
  title: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type ChatSearchHit = z.infer<typeof ChatSearchHitSchema>;

export const MessageSearchHitSchema = z.object({
  id: uuid,
  chatId: uuid,
  senderId: uuid,
  serverSeq: z.number().int().nonnegative(),
  contentType: MessageContentTypeSchema,
  createdAt: isoDate,
  editedAt: isoDate.nullable(),
});
export type MessageSearchHit = z.infer<typeof MessageSearchHitSchema>;

export const SearchResultSchema = z.object({
  users: z.array(PublicUserSchema),
  chats: z.array(ChatSearchHitSchema),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const MessageSearchQuerySchema = z.object({
  chatId: uuid,
  contentType: MessageContentTypeSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.coerce.number().int().nonnegative().optional(),
});
export type MessageSearchQuery = z.infer<typeof MessageSearchQuerySchema>;

export const MessageSearchResultSchema = z.object({
  items: z.array(MessageSearchHitSchema),
  nextCursor: z.number().int().nonnegative().nullable(),
});
export type MessageSearchResult = z.infer<typeof MessageSearchResultSchema>;
