import {
  DoubleRatchet,
  SenderKeyReceiver,
  SenderKeySession,
  encryptString,
  decryptString,
  generateIdentityKeys,
  generateOneTimePreKeys,
  generateSignedPreKey,
  publishableBundle,
  toBase64,
  fromBase64,
  random,
  utf8,
  verifyBundle,
  x3dhInitiator,
  x3dhResponder,
  type IdentityKeys,
  type SignedPreKey,
} from "@neochat/crypto";
import type { EncryptedEnvelope, KeyBundle, PublishKeysRequest } from "@neochat/shared";
import { apiFetch } from "./api";
import { idbDelete, idbGet, idbSet } from "./idb";
import { sdk } from "./sdk";

export const ALGO_DM = "double-ratchet-v1";
export const ALGO_GROUP = "sender-key-v1";
export const DECRYPT_FAILED = "Unable to decrypt";

interface StoredKeyPair {
  publicKey: string;
  privateKey: string;
}

interface StoredSignedPreKey {
  keyId: number;
  publicKey: string;
  privateKey: string;
  signature: string;
}

interface StoredIdentity {
  deviceId: string;
  identityKey: StoredKeyPair;
  signingKey: StoredKeyPair;
  signedPreKey: StoredSignedPreKey;
  oneTimePreKeys: StoredSignedPreKey[];
  nextOtpKeyId: number;
}

interface MessagePayload {
  type: "text" | "media" | "system" | "sender-key-distribution";
  body?: string;
  fileKey?: string;
  fileName?: string;
  mime?: string;
  kind?: string;
  distribution?: {
    chainId: string;
    iteration: number;
    chainKey: string;
    signingPublicKey: string;
    senderId: string;
  };
}

function keyPairToStored(kp: { publicKey: Uint8Array; privateKey: Uint8Array }): StoredKeyPair {
  return { publicKey: toBase64(kp.publicKey), privateKey: toBase64(kp.privateKey) };
}

function storedToKeyPair(s: StoredKeyPair) {
  return { publicKey: fromBase64(s.publicKey), privateKey: fromBase64(s.privateKey) };
}

function storedToIdentityKeys(stored: StoredIdentity): IdentityKeys {
  return {
    identityKey: storedToKeyPair(stored.identityKey),
    signingKey: storedToKeyPair(stored.signingKey),
  };
}

function storedToSignedPreKey(s: StoredSignedPreKey): SignedPreKey {
  return {
    keyId: s.keyId,
    keyPair: storedToKeyPair(s),
    signature: fromBase64(s.signature),
  };
}

function signedPreKeyToStored(spk: SignedPreKey): StoredSignedPreKey {
  return {
    keyId: spk.keyId,
    publicKey: toBase64(spk.keyPair.publicKey),
    privateKey: toBase64(spk.keyPair.privateKey),
    signature: toBase64(spk.signature),
  };
}

function generateDeviceId(): string {
  const bytes = random(16);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function loadOrCreateIdentity(deviceId?: string): Promise<StoredIdentity> {
  const existing = await idbGet<string>("identity", "current");
  if (existing) return JSON.parse(existing) as StoredIdentity;

  const fallback = localStorage.getItem("neochat.identity");
  if (fallback) {
    const parsed = JSON.parse(fallback) as StoredIdentity;
    await idbSet("identity", "current", fallback);
    return parsed;
  }

  const keys = generateIdentityKeys();
  const signedPreKey = generateSignedPreKey(keys, 1);
  const oneTimePreKeys = generateOneTimePreKeys(100, 10);
  const stored: StoredIdentity = {
    deviceId: deviceId ?? generateDeviceId(),
    identityKey: keyPairToStored(keys.identityKey),
    signingKey: keyPairToStored(keys.signingKey),
    signedPreKey: signedPreKeyToStored(signedPreKey),
    oneTimePreKeys: oneTimePreKeys.map(signedPreKeyToStored),
    nextOtpKeyId: 110,
  };
  const json = JSON.stringify(stored);
  await idbSet("identity", "current", json);
  localStorage.setItem("neochat.identity", json);
  return stored;
}

export async function getDeviceId(): Promise<string> {
  const identity = await loadOrCreateIdentity();
  return identity.deviceId;
}

export async function publishKeyBundle(deviceId: string): Promise<void> {
  const stored = await loadOrCreateIdentity(deviceId);
  const identity = storedToIdentityKeys(stored);
  const spk = storedToSignedPreKey(stored.signedPreKey);
  const otps = stored.oneTimePreKeys.map(storedToSignedPreKey);
  const bundle = publishableBundle(identity, spk, otps);
  const body: PublishKeysRequest = {
    deviceId: stored.deviceId,
    identityKey: bundle.identityKey,
    signingKey: bundle.signingKey,
    signedPreKey: bundle.signedPreKey,
    oneTimePreKeys: bundle.oneTimePreKeys,
  };
  await apiFetch("/keys/publish", { method: "POST", body: JSON.stringify(body) });
}

async function saveRatchetSession(peerUserId: string, session: DoubleRatchet): Promise<void> {
  await idbSet("ratchetSessions", peerUserId, JSON.stringify(session.toJSON()));
}

async function loadRatchetSession(peerUserId: string): Promise<DoubleRatchet | null> {
  const raw = await idbGet<string>("ratchetSessions", peerUserId);
  if (!raw) return null;
  return DoubleRatchet.fromJSON(JSON.parse(raw));
}

async function getOrCreateDmSession(
  peerUserId: string,
  peerDeviceId?: string,
): Promise<DoubleRatchet> {
  const existing = await loadRatchetSession(peerUserId);
  if (existing) return existing;

  const stored = await loadOrCreateIdentity();
  const identity = storedToIdentityKeys(stored);

  const bundles = await sdk.keys.listBundles(peerUserId);
  const target = peerDeviceId ? bundles.find((b) => b.deviceId === peerDeviceId) : bundles[0];
  if (!target) throw new Error("No key bundle for peer");

  const bundle: KeyBundle = target.bundle;
  if (
    !verifyBundle({
      identityKey: bundle.identityKey,
      signingKey: bundle.signingKey,
      signedPreKey: bundle.signedPreKey,
      oneTimePreKeys: bundle.oneTimePreKeys,
    })
  ) {
    throw new Error("Invalid peer key bundle");
  }

  const { sharedSecret } = x3dhInitiator(identity, {
    identityKey: bundle.identityKey,
    signingKey: bundle.signingKey,
    signedPreKey: bundle.signedPreKey,
    oneTimePreKeys: bundle.oneTimePreKeys,
  });

  const remoteRatchetKey = fromBase64(bundle.signedPreKey.publicKey);
  const session = DoubleRatchet.initSender(sharedSecret, remoteRatchetKey);
  await saveRatchetSession(peerUserId, session);
  return session;
}

export async function establishResponderSession(
  peerUserId: string,
  initiatorIdentityPublic: Uint8Array,
  initiatorEphemeralPublic: Uint8Array,
): Promise<DoubleRatchet> {
  const stored = await loadOrCreateIdentity();
  const identity = storedToIdentityKeys(stored);
  const spk = storedToSignedPreKey(stored.signedPreKey);
  const otp =
    stored.oneTimePreKeys.length > 0 ? storedToSignedPreKey(stored.oneTimePreKeys[0]!) : null;

  const sharedSecret = x3dhResponder(
    identity,
    spk,
    otp,
    initiatorIdentityPublic,
    initiatorEphemeralPublic,
  );
  const session = DoubleRatchet.initReceiver(sharedSecret, spk.keyPair);
  await saveRatchetSession(peerUserId, session);
  return session;
}

async function getOrCreateSenderKey(chatId: string): Promise<SenderKeySession> {
  const raw = await idbGet<string>("senderKeys", chatId);
  if (raw) return SenderKeySession.fromJSON(JSON.parse(raw));
  const session = SenderKeySession.create();
  await idbSet("senderKeys", chatId, JSON.stringify(session.toJSON()));
  return session;
}

async function getSenderKeyReceiver(
  chatId: string,
  senderId: string,
  chainId: string,
): Promise<SenderKeyReceiver | null> {
  const key = `${chatId}:${senderId}:${chainId}`;
  const raw = await idbGet<string>("senderKeyReceivers", key);
  if (!raw) return null;
  return SenderKeyReceiver.fromDistribution(JSON.parse(raw));
}

async function saveSenderKeyReceiver(
  chatId: string,
  senderId: string,
  distribution: { chainId: string; iteration: number; chainKey: string; signingPublicKey: string },
): Promise<void> {
  const key = `${chatId}:${senderId}:${distribution.chainId}`;
  await idbSet("senderKeyReceivers", key, JSON.stringify(distribution));
}

function payloadToBytes(payload: MessagePayload): Uint8Array {
  return utf8(JSON.stringify(payload));
}

function bytesToPayload(bytes: Uint8Array): MessagePayload {
  return JSON.parse(new TextDecoder().decode(bytes)) as MessagePayload;
}

export async function encryptForChat(
  chatId: string,
  chatType: "dm" | "group" | "channel",
  peerUserId: string | null,
  payload: MessagePayload,
  deviceId: string,
): Promise<EncryptedEnvelope> {
  const plaintext = payloadToBytes(payload);

  if (chatType === "dm" && peerUserId) {
    const session = await getOrCreateDmSession(peerUserId);
    const envelope = encryptString(session, JSON.stringify(payload), chatId);
    await saveRatchetSession(peerUserId, session);
    return {
      algorithm: ALGO_DM,
      header: envelope.header,
      ciphertext: envelope.ciphertext,
      senderDeviceId: deviceId,
    };
  }

  const senderSession = await getOrCreateSenderKey(chatId);
  const groupMsg = senderSession.encrypt(plaintext, utf8(chatId));
  await idbSet("senderKeys", chatId, JSON.stringify(senderSession.toJSON()));
  return {
    algorithm: ALGO_GROUP,
    header: toBase64(utf8(JSON.stringify(groupMsg))),
    ciphertext: groupMsg.ciphertext,
    senderDeviceId: deviceId,
  };
}

export async function encryptText(
  chatId: string,
  chatType: "dm" | "group" | "channel",
  peerUserId: string | null,
  text: string,
  deviceId: string,
): Promise<EncryptedEnvelope> {
  return encryptForChat(chatId, chatType, peerUserId, { type: "text", body: text }, deviceId);
}

export async function encryptMediaMeta(
  chatId: string,
  chatType: "dm" | "group" | "channel",
  peerUserId: string | null,
  meta: { fileKey: string; fileName: string; mime: string; kind: string },
  deviceId: string,
): Promise<EncryptedEnvelope> {
  return encryptForChat(chatId, chatType, peerUserId, { type: "media", ...meta }, deviceId);
}

export async function decryptEnvelope(
  chatId: string,
  _chatType: "dm" | "group" | "channel",
  envelope: EncryptedEnvelope,
  senderId: string,
  peerUserId: string | null,
): Promise<{ text: string; payload: MessagePayload } | { error: typeof DECRYPT_FAILED }> {
  try {
    if (envelope.algorithm === ALGO_DM) {
      if (!peerUserId) return { error: DECRYPT_FAILED };
      let session = await loadRatchetSession(peerUserId);
      if (!session) {
        session = await getOrCreateDmSession(peerUserId, envelope.senderDeviceId);
      }
      const text = decryptString(
        session,
        { header: envelope.header, ciphertext: envelope.ciphertext },
        chatId,
      );
      await saveRatchetSession(peerUserId, session);
      const payload = bytesToPayload(utf8(text));
      if (payload.type === "text" && payload.body) return { text: payload.body, payload };
      if (payload.type === "media") return { text: payload.fileName ?? "[media]", payload };
      if (payload.type === "sender-key-distribution") return { text: "[key update]", payload };
      return { text: text || DECRYPT_FAILED, payload };
    }

    if (envelope.algorithm === ALGO_GROUP) {
      const groupMsg = JSON.parse(new TextDecoder().decode(fromBase64(envelope.header))) as {
        chainId: string;
        iteration: number;
        ciphertext: string;
        signature: string;
      };
      const receiver = await getSenderKeyReceiver(chatId, senderId, groupMsg.chainId);
      if (!receiver) {
        return { error: DECRYPT_FAILED };
      }
      const bytes = receiver.decrypt(groupMsg, utf8(chatId));
      const payload = bytesToPayload(bytes);
      if (payload.type === "sender-key-distribution" && payload.distribution) {
        await saveSenderKeyReceiver(chatId, payload.distribution.senderId, payload.distribution);
      }
      if (payload.type === "text" && payload.body) return { text: payload.body, payload };
      if (payload.type === "media") return { text: payload.fileName ?? "[media]", payload };
      return { text: new TextDecoder().decode(bytes), payload };
    }

    return { error: DECRYPT_FAILED };
  } catch {
    return { error: DECRYPT_FAILED };
  }
}

export async function distributeSenderKey(
  chatId: string,
  peerUserId: string,
  deviceId: string,
  senderId: string,
): Promise<EncryptedEnvelope> {
  const senderSession = await getOrCreateSenderKey(chatId);
  const distribution = senderSession.distributionMessage();
  return encryptForChat(
    chatId,
    "dm",
    peerUserId,
    {
      type: "sender-key-distribution",
      distribution: { ...distribution, senderId },
    },
    deviceId,
  );
}

export async function importSenderKeyDistribution(
  chatId: string,
  senderId: string,
  distribution: { chainId: string; iteration: number; chainKey: string; signingPublicKey: string },
): Promise<void> {
  await saveSenderKeyReceiver(chatId, senderId, distribution);
}

export async function encryptFile(
  file: Blob,
): Promise<{ ciphertext: ArrayBuffer; fileKey: Uint8Array; sha256: string }> {
  const fileKey = random(32);
  const iv = random(12);
  const data = new Uint8Array(await file.arrayBuffer());
  const key = await crypto.subtle.importKey("raw", fileKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  const sha256 = Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return { ciphertext: combined.buffer, fileKey, sha256 };
}

export async function decryptFile(
  ciphertext: ArrayBuffer,
  fileKey: Uint8Array,
): Promise<ArrayBuffer> {
  const combined = new Uint8Array(ciphertext);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const key = await crypto.subtle.importKey("raw", fileKey, "AES-GCM", false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
}

export async function encryptDraft(
  chatId: string,
  chatType: "dm" | "group" | "channel",
  peerUserId: string | null,
  text: string,
  deviceId: string,
): Promise<string> {
  const envelope = await encryptText(chatId, chatType, peerUserId, text, deviceId);
  return JSON.stringify(envelope);
}

export async function decryptDraft(
  chatId: string,
  chatType: "dm" | "group" | "channel",
  ciphertext: string,
  peerUserId: string | null,
): Promise<string> {
  try {
    const envelope = JSON.parse(ciphertext) as EncryptedEnvelope;
    const result = await decryptEnvelope(chatId, chatType, envelope, "", peerUserId);
    if ("error" in result) return "";
    return result.text;
  } catch {
    return "";
  }
}

export async function clearCryptoSession(peerUserId: string): Promise<void> {
  await idbDelete("ratchetSessions", peerUserId);
}
