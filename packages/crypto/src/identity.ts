import {
  type Bytes,
  type KeyPair,
  concat,
  dh,
  fromBase64,
  generateDhKeyPair,
  generateSigningKeyPair,
  hkdfSharedSecret,
  sign,
  toBase64,
  utf8,
  verify,
} from "./primitives.js";

/**
 * A device's long-term key material.
 * - identityKey (X25519) is used for DH agreement.
 * - signingKey (Ed25519) signs prekeys and sender-key distribution messages.
 */
export interface IdentityKeys {
  identityKey: KeyPair;
  signingKey: KeyPair;
}

export interface SignedPreKey {
  keyId: number;
  keyPair: KeyPair;
  signature: Bytes;
}

export interface PreKeyBundlePublic {
  identityKey: string;
  signingKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string };
  oneTimePreKeys: { keyId: number; publicKey: string }[];
}

export function generateIdentityKeys(): IdentityKeys {
  return {
    identityKey: generateDhKeyPair(),
    signingKey: generateSigningKeyPair(),
  };
}

export function generateSignedPreKey(identity: IdentityKeys, keyId: number): SignedPreKey {
  const keyPair = generateDhKeyPair();
  const signature = sign(identity.signingKey.privateKey, keyPair.publicKey);
  return { keyId, keyPair, signature };
}

export function generateOneTimePreKeys(startKeyId: number, count: number): SignedPreKey[] {
  const keys: SignedPreKey[] = [];
  for (let i = 0; i < count; i++) {
    const keyPair = generateDhKeyPair();
    keys.push({ keyId: startKeyId + i, keyPair, signature: new Uint8Array(0) });
  }
  return keys;
}

export function publishableBundle(
  identity: IdentityKeys,
  signedPreKey: SignedPreKey,
  oneTimePreKeys: SignedPreKey[],
): PreKeyBundlePublic {
  return {
    identityKey: toBase64(identity.identityKey.publicKey),
    signingKey: toBase64(identity.signingKey.publicKey),
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: toBase64(signedPreKey.keyPair.publicKey),
      signature: toBase64(signedPreKey.signature),
    },
    oneTimePreKeys: oneTimePreKeys.map((k) => ({
      keyId: k.keyId,
      publicKey: toBase64(k.keyPair.publicKey),
    })),
  };
}

export function verifyBundle(bundle: PreKeyBundlePublic): boolean {
  return verify(
    fromBase64(bundle.signingKey),
    fromBase64(bundle.signedPreKey.signature),
    fromBase64(bundle.signedPreKey.publicKey),
  );
}

const X3DH_INFO = utf8("NeoChat-X3DH-v1");

/**
 * Initiator side of a simplified X3DH. Produces a shared secret and the
 * ephemeral public key the responder needs to derive the same secret.
 */
export function x3dhInitiator(
  initiatorIdentity: IdentityKeys,
  bundle: PreKeyBundlePublic,
): { sharedSecret: Bytes; ephemeralPublicKey: Bytes; usedPreKeyId: number | null } {
  const ephemeral = generateDhKeyPair();
  const theirIdentity = fromBase64(bundle.identityKey);
  const theirSpk = fromBase64(bundle.signedPreKey.publicKey);
  const otp = bundle.oneTimePreKeys[0];
  const theirOtp = otp ? fromBase64(otp.publicKey) : null;

  const dh1 = dh(initiatorIdentity.identityKey.privateKey, theirSpk);
  const dh2 = dh(ephemeral.privateKey, theirIdentity);
  const dh3 = dh(ephemeral.privateKey, theirSpk);
  const parts = [dh1, dh2, dh3];
  if (theirOtp) parts.push(dh(ephemeral.privateKey, theirOtp));

  const sharedSecret = hkdfSharedSecret(concat(...parts), X3DH_INFO);
  return {
    sharedSecret,
    ephemeralPublicKey: ephemeral.publicKey,
    usedPreKeyId: otp ? otp.keyId : null,
  };
}

/** Responder side: reconstruct the same shared secret. */
export function x3dhResponder(
  responderIdentity: IdentityKeys,
  signedPreKey: SignedPreKey,
  oneTimePreKey: SignedPreKey | null,
  initiatorIdentityPublic: Bytes,
  initiatorEphemeralPublic: Bytes,
): Bytes {
  const dh1 = dh(signedPreKey.keyPair.privateKey, initiatorIdentityPublic);
  const dh2 = dh(responderIdentity.identityKey.privateKey, initiatorEphemeralPublic);
  const dh3 = dh(signedPreKey.keyPair.privateKey, initiatorEphemeralPublic);
  const parts = [dh1, dh2, dh3];
  if (oneTimePreKey) parts.push(dh(oneTimePreKey.keyPair.privateKey, initiatorEphemeralPublic));
  return hkdfSharedSecret(concat(...parts), X3DH_INFO);
}
