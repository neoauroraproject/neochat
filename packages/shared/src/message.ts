import { z } from "zod";
import { isoDate, uuid } from "./common.js";
import type { EncryptedEnvelope } from "./keys.js";
import { EncryptedEnvelopeSchema } from "./keys.js";

export const MessageContentTypeSchema = z.enum(["text", "media", "system"]);
export type MessageContentType = z.infer<typeof MessageContentTypeSchema>;

/** Ratchet/session metadata stored alongside ciphertext — never plaintext. */
export const RatchetHeaderSchema = z.object({
  algorithm: z.string().min(1),
  header: z.string().min(1),
  senderDeviceId: uuid,
});
export type RatchetHeader = z.infer<typeof RatchetHeaderSchema>;

/** Wire/storage envelope — ciphertext fields only; no plaintext body. */
export const MessageEnvelopeSchema = z.object({
  ciphertext: z.string().min(1),
  nonce: z.string().min(1),
  ratchetHeader: RatchetHeaderSchema,
});
export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

export function encryptedEnvelopeToMessageEnvelope(envelope: EncryptedEnvelope): MessageEnvelope {
  return {
    ciphertext: envelope.ciphertext,
    nonce: envelope.header,
    ratchetHeader: {
      algorithm: envelope.algorithm,
      header: envelope.header,
      senderDeviceId: envelope.senderDeviceId,
    },
  };
}

export function messageEnvelopeToEncryptedEnvelope(envelope: MessageEnvelope): EncryptedEnvelope {
  return {
    algorithm: envelope.ratchetHeader.algorithm,
    header: envelope.nonce,
    ciphertext: envelope.ciphertext,
    senderDeviceId: envelope.ratchetHeader.senderDeviceId,
  };
}

export const ReactionSchema = z.object({
  messageId: uuid,
  userId: uuid,
  emoji: z.string().min(1).max(16),
  createdAt: isoDate,
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const ReactRequestSchema = z.object({
  emoji: z.string().min(1).max(16),
});
export type ReactRequest = z.infer<typeof ReactRequestSchema>;

export const ReceiptStatusSchema = z.enum(["delivered", "read"]);
export type ReceiptStatus = z.infer<typeof ReceiptStatusSchema>;

export const MessageReceiptSchema = z.object({
  messageId: uuid,
  userId: uuid,
  deviceId: uuid,
  status: ReceiptStatusSchema,
  at: isoDate,
});
export type MessageReceipt = z.infer<typeof MessageReceiptSchema>;

export const ReadReceiptRequestSchema = z.object({
  messageId: uuid,
  status: ReceiptStatusSchema,
});
export type ReadReceiptRequest = z.infer<typeof ReadReceiptRequestSchema>;

export const MessageSchema = z.object({
  id: uuid,
  chatId: uuid,
  senderId: uuid,
  senderDeviceId: uuid,
  serverSeq: z.number().int().nonnegative(),
  contentType: MessageContentTypeSchema,
  envelope: EncryptedEnvelopeSchema,
  mediaObjectId: uuid.nullable().optional(),
  replyToId: uuid.nullable().optional(),
  forwardedFromId: uuid.nullable().optional(),
  clientId: z.string().optional(),
  createdAt: isoDate,
  editedAt: isoDate.nullable().optional(),
  deletedAt: isoDate.nullable().optional(),
  pinnedAt: isoDate.nullable().optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const SendMessageRequestSchema = z.object({
  chatId: uuid,
  contentType: MessageContentTypeSchema,
  envelope: EncryptedEnvelopeSchema,
  mediaObjectId: uuid.optional(),
  replyToId: uuid.optional(),
  clientId: z.string().optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const EditMessageRequestSchema = z.object({
  envelope: EncryptedEnvelopeSchema,
});
export type EditMessageRequest = z.infer<typeof EditMessageRequestSchema>;

export const ForwardMessageRequestSchema = z.object({
  targetChatId: uuid,
  envelope: EncryptedEnvelopeSchema.optional(),
});
export type ForwardMessageRequest = z.infer<typeof ForwardMessageRequestSchema>;

export const MessageListQuerySchema = z.object({
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;

export const MessagePageSchema = z.object({
  items: z.array(MessageSchema),
  nextCursor: z.number().int().nonnegative().nullable(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;
