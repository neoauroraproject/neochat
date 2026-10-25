import { x25519, ed25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { hmac } from "@noble/hashes/hmac";
import { gcm } from "@noble/ciphers/aes";
import { randomBytes } from "@noble/hashes/utils";

export type Bytes = Uint8Array;

export interface KeyPair {
  publicKey: Bytes;
  privateKey: Bytes;
}

const enc = new TextEncoder();

export function utf8(s: string): Bytes {
  return enc.encode(s);
}

export function toBase64(b: Bytes): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b).toString("base64");
  let str = "";
  for (const byte of b) str += String.fromCharCode(byte);
  return btoa(str);
}

export function fromBase64(s: string): Bytes {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function random(len: number): Bytes {
  return randomBytes(len);
}

export function concat(...arrays: Bytes[]): Bytes {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** Constant-time equality. */
export function equal(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ---- X25519 (Diffie-Hellman) ----
export function generateDhKeyPair(): KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function dh(privateKey: Bytes, publicKey: Bytes): Bytes {
  return x25519.getSharedSecret(privateKey, publicKey);
}

// ---- Ed25519 (signatures) ----
export function generateSigningKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function sign(privateKey: Bytes, message: Bytes): Bytes {
  return ed25519.sign(message, privateKey);
}

export function verify(publicKey: Bytes, signature: Bytes, message: Bytes): boolean {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}

// ---- KDFs ----
const RATCHET_INFO = utf8("NeoChat-Ratchet-v1");

/** Root-key KDF: (RK, DHOutput) -> (RK', ChainKey). */
export function kdfRootKey(rootKey: Bytes, dhOut: Bytes): { rootKey: Bytes; chainKey: Bytes } {
  const out = hkdf(sha256, dhOut, rootKey, RATCHET_INFO, 64);
  return { rootKey: out.slice(0, 32), chainKey: out.slice(32, 64) };
}

/** Chain-key KDF: ChainKey -> (ChainKey', MessageKey). */
export function kdfChainKey(chainKey: Bytes): { chainKey: Bytes; messageKey: Bytes } {
  const messageKey = hmac(sha256, chainKey, new Uint8Array([0x01]));
  const nextChainKey = hmac(sha256, chainKey, new Uint8Array([0x02]));
  return { chainKey: nextChainKey, messageKey };
}

/** Derive a 32-byte shared secret from concatenated DH outputs. */
export function hkdfSharedSecret(ikm: Bytes, info: Bytes): Bytes {
  return hkdf(sha256, ikm, new Uint8Array(32), info, 32);
}

// ---- AEAD (AES-256-GCM) ----
const AEAD_INFO = utf8("NeoChat-AEAD-v1");

/** Derive (encKey, iv) from a 32-byte message key. */
function deriveAead(messageKey: Bytes): { key: Bytes; iv: Bytes } {
  const out = hkdf(sha256, messageKey, new Uint8Array(32), AEAD_INFO, 44);
  return { key: out.slice(0, 32), iv: out.slice(32, 44) };
}

export function aeadEncrypt(messageKey: Bytes, plaintext: Bytes, associatedData: Bytes): Bytes {
  const { key, iv } = deriveAead(messageKey);
  return gcm(key, iv, associatedData).encrypt(plaintext);
}

export function aeadDecrypt(messageKey: Bytes, ciphertext: Bytes, associatedData: Bytes): Bytes {
  const { key, iv } = deriveAead(messageKey);
  return gcm(key, iv, associatedData).decrypt(ciphertext);
}
