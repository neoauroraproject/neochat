import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DoubleRatchet,
  SenderKeyReceiver,
  SenderKeySession,
  generateIdentityKeys,
  generateOneTimePreKeys,
  generateSignedPreKey,
  publishableBundle,
  utf8,
  verifyBundle,
  x3dhInitiator,
  x3dhResponder,
} from "../dist/index.js";
const dec = new TextDecoder();
test("double ratchet round-trips with X3DH handshake", () => {
  const alice = generateIdentityKeys();
  const bob = generateIdentityKeys();
  const bobSpk = generateSignedPreKey(bob, 1);
  const bobOtps = generateOneTimePreKeys(100, 1);
  const bundle = publishableBundle(bob, bobSpk, bobOtps);
  assert.equal(verifyBundle(bundle), true);
  const { sharedSecret, ephemeralPublicKey } = x3dhInitiator(alice, bundle);
  const bobShared = x3dhResponder(
    bob,
    bobSpk,
    bobOtps[0],
    alice.identityKey.publicKey,
    ephemeralPublicKey,
  );
  assert.deepEqual(sharedSecret, bobShared);
  const bobRatchetKey = bobSpk.keyPair;
  const aliceSession = DoubleRatchet.initSender(sharedSecret, bobRatchetKey.publicKey);
  const bobSession = DoubleRatchet.initReceiver(bobShared, bobRatchetKey);
  const m1 = aliceSession.encrypt(utf8("hello bob"));
  assert.equal(dec.decode(bobSession.decrypt(m1)), "hello bob");
  const r1 = bobSession.encrypt(utf8("hi alice"));
  assert.equal(dec.decode(aliceSession.decrypt(r1)), "hi alice");
  // out-of-order delivery
  const a = aliceSession.encrypt(utf8("one"));
  const b = aliceSession.encrypt(utf8("two"));
  assert.equal(dec.decode(bobSession.decrypt(b)), "two");
  assert.equal(dec.decode(bobSession.decrypt(a)), "one");
});
test("sender keys round-trip for groups", () => {
  const sender = SenderKeySession.create();
  const receiver = SenderKeyReceiver.fromDistribution(sender.distributionMessage());
  const e1 = sender.encrypt(utf8("group hello"));
  const e2 = sender.encrypt(utf8("group world"));
  assert.equal(dec.decode(receiver.decrypt(e1)), "group hello");
  assert.equal(dec.decode(receiver.decrypt(e2)), "group world");
});
//# sourceMappingURL=ratchet.test.js.map
