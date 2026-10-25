import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCertificatePem } from "../src/tls/tls-validation.js";

test("validateCertificatePem rejects malformed PEM", () => {
  const result = validateCertificatePem("not-a-cert");
  assert.equal(result.valid, false);
  assert.ok(result.errors?.length);
});

test("validateCertificatePem rejects truncated PEM block", () => {
  const result = validateCertificatePem(
    "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
  );
  assert.equal(result.valid, false);
});
