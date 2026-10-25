import {
  type Bytes,
  type KeyPair,
  aeadDecrypt,
  aeadEncrypt,
  concat,
  fromBase64,
  generateSigningKeyPair,
  kdfChainKey,
  random,
  sign,
  toBase64,
  utf8,
  verify,
} from "./primitives.js";

/**
 * Sender Keys for group messaging. Each sender maintains a symmetric chain
 * key that ratchets forward per message, plus an Ed25519 signing key so
 * recipients can authenticate the origin. New members receive the current
 * chain state via a distribution message (delivered over 1:1 ratchet
 * sessions in production).
 */

export interface SenderKeyDistributionMessage {
  chainId: string;
  iteration: number;
  chainKey: string; // base64
  signingPublicKey: string; // base64
}

export interface GroupEncryptedMessage {
  chainId: string;
  iteration: number;
  ciphertext: string; // base64
  signature: string; // base64
}

interface SenderKeyStateJSON {
  chainId: string;
  iteration: number;
  chainKey: string;
  signingPub: string;
  signingPriv: string;
}

export class SenderKeySession {
  private chainId: string;
  private iteration: number;
  private chainKey: Bytes;
  private signing: KeyPair;

  private constructor(chainId: string, iteration: number, chainKey: Bytes, signing: KeyPair) {
    this.chainId = chainId;
    this.iteration = iteration;
    this.chainKey = chainKey;
    this.signing = signing;
  }

  /** Create a brand-new sender chain for this device in a group. */
  static create(chainId = toBase64(random(16))): SenderKeySession {
    return new SenderKeySession(chainId, 0, random(32), generateSigningKeyPair());
  }

  /** Export a distribution message so other members can decrypt our messages. */
  distributionMessage(): SenderKeyDistributionMessage {
    return {
      chainId: this.chainId,
      iteration: this.iteration,
      chainKey: toBase64(this.chainKey),
      signingPublicKey: toBase64(this.signing.publicKey),
    };
  }

  encrypt(plaintext: Bytes, associatedData: Bytes = new Uint8Array(0)): GroupEncryptedMessage {
    const iteration = this.iteration;
    const { chainKey, messageKey } = kdfChainKey(this.chainKey);
    this.chainKey = chainKey;
    this.iteration += 1;

    const ad = concat(associatedData, utf8(`${this.chainId}:${iteration}`));
    const ciphertext = aeadEncrypt(messageKey, plaintext, ad);
    const signature = sign(this.signing.privateKey, ciphertext);
    return {
      chainId: this.chainId,
      iteration,
      ciphertext: toBase64(ciphertext),
      signature: toBase64(signature),
    };
  }

  toJSON(): SenderKeyStateJSON {
    return {
      chainId: this.chainId,
      iteration: this.iteration,
      chainKey: toBase64(this.chainKey),
      signingPub: toBase64(this.signing.publicKey),
      signingPriv: toBase64(this.signing.privateKey),
    };
  }

  static fromJSON(state: SenderKeyStateJSON): SenderKeySession {
    return new SenderKeySession(state.chainId, state.iteration, fromBase64(state.chainKey), {
      publicKey: fromBase64(state.signingPub),
      privateKey: fromBase64(state.signingPriv),
    });
  }
}

/** Receiver-side view of a remote member's sender chain. */
export class SenderKeyReceiver {
  private chainId: string;
  private iteration: number;
  private chainKey: Bytes;
  private signingPublicKey: Bytes;
  private cache = new Map<number, Bytes>();

  private constructor(
    chainId: string,
    iteration: number,
    chainKey: Bytes,
    signingPublicKey: Bytes,
  ) {
    this.chainId = chainId;
    this.iteration = iteration;
    this.chainKey = chainKey;
    this.signingPublicKey = signingPublicKey;
  }

  static fromDistribution(msg: SenderKeyDistributionMessage): SenderKeyReceiver {
    return new SenderKeyReceiver(
      msg.chainId,
      msg.iteration,
      fromBase64(msg.chainKey),
      fromBase64(msg.signingPublicKey),
    );
  }

  decrypt(message: GroupEncryptedMessage, associatedData: Bytes = new Uint8Array(0)): Bytes {
    if (message.chainId !== this.chainId) throw new Error("Sender key chain mismatch");
    const ciphertext = fromBase64(message.ciphertext);
    if (!verify(this.signingPublicKey, fromBase64(message.signature), ciphertext)) {
      throw new Error("Invalid sender-key signature");
    }
    const messageKey = this.messageKeyFor(message.iteration);
    const ad = concat(associatedData, utf8(`${this.chainId}:${message.iteration}`));
    return aeadDecrypt(messageKey, ciphertext, ad);
  }

  private messageKeyFor(iteration: number): Bytes {
    const cached = this.cache.get(iteration);
    if (cached) {
      this.cache.delete(iteration);
      return cached;
    }
    if (iteration < this.iteration) throw new Error("Sender key message too old");
    while (this.iteration <= iteration) {
      const { chainKey, messageKey } = kdfChainKey(this.chainKey);
      this.chainKey = chainKey;
      if (this.iteration === iteration) {
        this.iteration += 1;
        return messageKey;
      }
      this.cache.set(this.iteration, messageKey);
      this.iteration += 1;
    }
    throw new Error("Unreachable sender-key iteration");
  }
}
