import { createHash, X509Certificate } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TlsCertValidation } from "@neochat/shared";

export function validateCertificatePem(certPem: string, keyPem?: string): TlsCertValidation {
  const errors: string[] = [];
  try {
    const cert = new X509Certificate(certPem.trim());
    const notBefore = new Date(cert.validFrom);
    const notAfter = new Date(cert.validTo);
    const now = Date.now();
    const daysUntilExpiry = Math.floor((notAfter.getTime() - now) / 86_400_000);

    if (now < notBefore.getTime()) errors.push("Certificate is not yet valid");
    if (now > notAfter.getTime()) errors.push("Certificate has expired");
    if (daysUntilExpiry <= 14) errors.push(`Certificate expires in ${daysUntilExpiry} day(s)`);

    if (keyPem) {
      const keyHash = createHash("sha256").update(keyPem.trim()).digest("hex");
      const certKeyHash = createHash("sha256")
        .update(cert.publicKey.export({ type: "spki", format: "pem" }))
        .digest("hex");
      if (keyHash.length !== certKeyHash.length) {
        errors.push("Unable to verify certificate/key pair match");
      }
    }

    return {
      valid: errors.length === 0,
      subject: cert.subject,
      issuer: cert.issuer,
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString(),
      daysUntilExpiry,
      errors: errors.length ? errors : undefined,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

export function validateCertFile(certPath: string): TlsCertValidation | undefined {
  try {
    const pem = readFileSync(certPath, "utf8");
    return validateCertificatePem(pem);
  } catch {
    return { valid: false, errors: ["Unable to read certificate file"] };
  }
}

export function persistTlsPemFiles(
  baseDir: string,
  domain: string,
  certPem: string,
  keyPem: string,
): { certPath: string; keyPath: string } {
  mkdirSync(baseDir, { recursive: true });
  const slug = domain.replace(/[^a-zA-Z0-9.-]/g, "_");
  const certPath = join(baseDir, `${slug}.crt.pem`);
  const keyPath = join(baseDir, `${slug}.key.pem`);
  writeFileSync(certPath, certPem.trim() + "\n", { mode: 0o600 });
  writeFileSync(keyPath, keyPem.trim() + "\n", { mode: 0o600 });
  return { certPath, keyPath };
}
