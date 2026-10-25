import { test } from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";

test("argon2id hash and verify round-trip", async () => {
  const password = "correct-horse-battery-staple";
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
  });
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(hash, password), true);
  assert.equal(await argon2.verify(hash, "wrong-password").catch(() => false), false);
});

test("argon2 rejects empty password verification safely", async () => {
  const hash = await argon2.hash("secret-password-1234", { type: argon2.argon2id });
  assert.equal(await argon2.verify(hash, "").catch(() => false), false);
});
