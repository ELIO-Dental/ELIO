// Constant-time CRON_SECRET verification, shared by every app's cron
// routes. Plain `authHeader !== \`Bearer ${secret}\`` (used by every one of
// these routes before this fix) compares character-by-character and
// short-circuits on the first mismatch, a real timing side-channel in
// principle — low practical risk for a cron endpoint, but free to close
// (found in a security review, 2026-09-12).
import { createHash, timingSafeEqual } from "node:crypto";

/** True only when `authHeader` is exactly `Bearer <expectedSecret>`,
 * compared in constant time. Hashing both sides to a fixed-length digest
 * first means even the LENGTH of the provided secret isn't observable via
 * timing (`timingSafeEqual` itself throws on a raw length mismatch, which
 * would otherwise leak length via a fast-reject vs. slow-compare path). */
export function verifyCronSecret(authHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false;
  const provided = authHeader ?? "";
  const expected = `Bearer ${expectedSecret}`;
  return timingSafeEqual(hashConstantLength(provided), hashConstantLength(expected));
}

function hashConstantLength(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
