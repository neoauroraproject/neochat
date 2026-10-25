import {
  type Bytes,
  type KeyPair,
  aeadDecrypt,
  aeadEncrypt,
  concat,
  dh,
  equal,
  fromBase64,
  generateDhKeyPair,
  kdfChainKey,
  kdfRootKey,
  toBase64,
  utf8,
} from "./primitives.js";

const MAX_SKIP = 1000;

export interface RatchetHeader {
  dh: string; // base64 ratchet public key
  pn: number; // previous chain length
  n: number; // message number
}

export interface EncryptedMessage {
  header: RatchetHeader;
  ciphertext: string; // base64
}

interface SkippedKey {
  dh: string;
  n: number;
  messageKey: string;
}

export interface RatchetStateJSON {
  dhsPub: string;
  dhsPriv: string;
  dhr: string | null;
  rk: string;
  cks: string | null;
  ckr: string | null;
  ns: number;
  nr: number;
  pn: number;
  skipped: SkippedKey[];
}

/**
 * Signal-style Double Ratchet for 1:1 sessions.
 * Provides forward secrecy and post-compromise security.
 */
export class DoubleRatchet {
  private dhs: KeyPair;
  private dhr: Bytes | null;
  private rk: Bytes;
  private cks: Bytes | null;
  private ckr: Bytes | null;
  private ns = 0;
  private nr = 0;
  private pn = 0;
  private skipped = new Map<string, Bytes>();

  private constructor(
    dhs: KeyPair,
    dhr: Bytes | null,
    rk: Bytes,
    cks: Bytes | null,
    ckr: Bytes | null,
  ) {
    this.dhs = dhs;
    this.dhr = dhr;
    this.rk = rk;
    this.cks = cks;
    this.ckr = ckr;
  }

  /** Initiator: knows the responder's initial ratchet public key. */
  static initSender(sharedSecret: Bytes, remoteRatchetKey: Bytes): DoubleRatchet {
    const dhs = generateDhKeyPair();
    const { rootKey, chainKey } = kdfRootKey(sharedSecret, dh(dhs.privateKey, remoteRatchetKey));
    return new DoubleRatchet(dhs, remoteRatchetKey, rootKey, chainKey, null);
  }

  /** Responder: publishes `ratchetKeyPair.publicKey` as its initial ratchet key. */
  static initReceiver(sharedSecret: Bytes, ratchetKeyPair: KeyPair): DoubleRatchet {
    return new DoubleRatchet(ratchetKeyPair, null, sharedSecret, null, null);
  }

  get ratchetPublicKey(): Bytes {
    return this.dhs.publicKey;
  }

  private static headerBytes(header: RatchetHeader): Bytes {
    return utf8(JSON.stringify(header));
  }

  encrypt(plaintext: Bytes, associatedData: Bytes = new Uint8Array(0)): EncryptedMessage {
    if (!this.cks) throw new Error("Ratchet cannot encrypt before sending chain is established");
    const { chainKey, messageKey } = kdfChainKey(this.cks);
    this.cks = chainKey;
    const header: RatchetHeader = { dh: toBase64(this.dhs.publicKey), pn: this.pn, n: this.ns };
    this.ns += 1;
    const ad = concat(associatedData, DoubleRatchet.headerBytes(header));
    const ciphertext = aeadEncrypt(messageKey, plaintext, ad);
    return { header, ciphertext: toBase64(ciphertext) };
  }

  decrypt(message: EncryptedMessage, associatedData: Bytes = new Uint8Array(0)): Bytes {
    const header = message.header;
    const ciphertext = fromBase64(message.ciphertext);
    const ad = concat(associatedData, DoubleRatchet.headerBytes(header));

    const skippedKey = this.trySkipped(header, ciphertext, ad);
    if (skippedKey) return skippedKey;

    const remoteKey = fromBase64(header.dh);
    if (!this.dhr || !equal(remoteKey, this.dhr)) {
      this.skipMessageKeys(header.pn);
      this.dhRatchet(remoteKey);
    }
    this.skipMessageKeys(header.n);

    if (!this.ckr) throw new Error("Receiving chain not established");
    const { chainKey, messageKey } = kdfChainKey(this.ckr);
    this.ckr = chainKey;
    this.nr += 1;
    return aeadDecrypt(messageKey, ciphertext, ad);
  }

  private trySkipped(header: RatchetHeader, ciphertext: Bytes, ad: Bytes): Bytes | null {
    const id = `${header.dh}:${header.n}`;
    const mk = this.skipped.get(id);
    if (!mk) return null;
    this.skipped.delete(id);
    return aeadDecrypt(mk, ciphertext, ad);
  }

  private skipMessageKeys(until: number): void {
    if (!this.ckr) return;
    if (this.nr + MAX_SKIP < until) throw new Error("Too many skipped messages");
    while (this.nr < until) {
      const { chainKey, messageKey } = kdfChainKey(this.ckr);
      this.ckr = chainKey;
      this.skipped.set(`${toBase64(this.dhr!)}:${this.nr}`, messageKey);
      this.nr += 1;
    }
  }

  private dhRatchet(remoteKey: Bytes): void {
    this.pn = this.ns;
    this.ns = 0;
    this.nr = 0;
    this.dhr = remoteKey;
    {
      const { rootKey, chainKey } = kdfRootKey(this.rk, dh(this.dhs.privateKey, remoteKey));
      this.rk = rootKey;
      this.ckr = chainKey;
    }
    this.dhs = generateDhKeyPair();
    {
      const { rootKey, chainKey } = kdfRootKey(this.rk, dh(this.dhs.privateKey, remoteKey));
      this.rk = rootKey;
      this.cks = chainKey;
    }
  }

  toJSON(): RatchetStateJSON {
    return {
      dhsPub: toBase64(this.dhs.publicKey),
      dhsPriv: toBase64(this.dhs.privateKey),
      dhr: this.dhr ? toBase64(this.dhr) : null,
      rk: toBase64(this.rk),
      cks: this.cks ? toBase64(this.cks) : null,
      ckr: this.ckr ? toBase64(this.ckr) : null,
      ns: this.ns,
      nr: this.nr,
      pn: this.pn,
      skipped: [...this.skipped.entries()].map(([k, v]) => {
        const [dhKey, n] = k.split(":");
        return { dh: dhKey!, n: Number(n), messageKey: toBase64(v) };
      }),
    };
  }

  static fromJSON(state: RatchetStateJSON): DoubleRatchet {
    const ratchet = new DoubleRatchet(
      { publicKey: fromBase64(state.dhsPub), privateKey: fromBase64(state.dhsPriv) },
      state.dhr ? fromBase64(state.dhr) : null,
      fromBase64(state.rk),
      state.cks ? fromBase64(state.cks) : null,
      state.ckr ? fromBase64(state.ckr) : null,
    );
    ratchet.ns = state.ns;
    ratchet.nr = state.nr;
    ratchet.pn = state.pn;
    for (const s of state.skipped) {
      ratchet.skipped.set(`${s.dh}:${s.n}`, fromBase64(s.messageKey));
    }
    return ratchet;
  }
}
