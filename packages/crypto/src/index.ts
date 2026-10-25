export * from "./primitives.js";
export * from "./identity.js";
export * from "./double-ratchet.js";
export * from "./sender-keys.js";

import { type DoubleRatchet, type EncryptedMessage, type RatchetHeader } from "./double-ratchet.js";
import { fromBase64, toBase64, utf8 } from "./primitives.js";

const decoder = new TextDecoder();

/**
 * Convenience API: encrypt/decrypt UTF-8 strings against a Double Ratchet
 * session, returning the wire envelope used by NeoChat messages.
 */
export interface StringEnvelope {
  header: string; // base64(JSON header)
  ciphertext: string;
}

export function encryptString(session: DoubleRatchet, text: string, ad?: string): StringEnvelope {
  const msg = session.encrypt(utf8(text), ad ? utf8(ad) : undefined);
  return { header: toBase64(utf8(JSON.stringify(msg.header))), ciphertext: msg.ciphertext };
}

export function decryptString(
  session: DoubleRatchet,
  envelope: StringEnvelope,
  ad?: string,
): string {
  const header = JSON.parse(decoder.decode(fromBase64(envelope.header))) as RatchetHeader;
  const msg: EncryptedMessage = { header, ciphertext: envelope.ciphertext };
  return decoder.decode(session.decrypt(msg, ad ? utf8(ad) : undefined));
}
