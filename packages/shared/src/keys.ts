import { z } from "zod";
import { uuid } from "./common.js";

export const SignedPreKeyPublicSchema = z.object({
  keyId: z.number().int(),
  publicKey: z.string().min(1),
  signature: z.string().min(1),
});
export type SignedPreKeyPublic = z.infer<typeof SignedPreKeyPublicSchema>;

export const OneTimePreKeyPublicSchema = z.object({
  keyId: z.number().int(),
  publicKey: z.string().min(1),
});
export type OneTimePreKeyPublic = z.infer<typeof OneTimePreKeyPublicSchema>;

export const KeyBundleSchema = z.object({
  identityKey: z.string().min(1),
  signingKey: z.string().min(1),
  signedPreKey: SignedPreKeyPublicSchema,
  oneTimePreKeys: z.array(OneTimePreKeyPublicSchema),
});
export type KeyBundle = z.infer<typeof KeyBundleSchema>;

export const PublishKeysRequestSchema = z.object({
  deviceId: uuid,
  identityKey: z.string().min(1),
  signingKey: z.string().min(1),
  signedPreKey: SignedPreKeyPublicSchema,
  oneTimePreKeys: z.array(OneTimePreKeyPublicSchema),
});
export type PublishKeysRequest = z.infer<typeof PublishKeysRequestSchema>;

/** Alias for publish-keys API payloads. */
export const PublishKeysSchema = PublishKeysRequestSchema;
export type PublishKeys = PublishKeysRequest;

export const DeviceKeyBundleSchema = z.object({
  deviceId: uuid,
  bundle: KeyBundleSchema,
});
export type DeviceKeyBundle = z.infer<typeof DeviceKeyBundleSchema>;

export const EncryptedEnvelopeSchema = z.object({
  algorithm: z.string().min(1),
  header: z.string().min(1),
  ciphertext: z.string().min(1),
  senderDeviceId: uuid,
});
export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;
