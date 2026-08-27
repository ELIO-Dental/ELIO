// TOTP-based MFA — available to every user by default (FR-2).
import { TOTP, Secret } from "otpauth";

const ISSUER = "ELIO";

export function generateMfaSecret(): string {
  return new Secret({ size: 20 }).base32;
}

function totpFor(email: string, secret: string) {
  return new TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export function mfaOtpAuthUrl(email: string, secret: string): string {
  return totpFor(email, secret).toString();
}

/** Validates a 6-digit TOTP code, allowing +/- 1 step of clock drift. */
export function verifyMfaCode(email: string, secret: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const delta = totpFor(email, secret).validate({ token: code, window: 1 });
  return delta !== null;
}
