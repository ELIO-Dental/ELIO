// Minimal in-memory login rate limiter — prevents unbounded password/MFA
// guessing against the Credentials provider. This is a stopgap: it resets on
// server restart and doesn't share state across multiple instances, so it
// should be replaced with a shared store (e.g. Redis/Upstash) before any
// multi-instance production deploy. It still meaningfully raises the cost of
// a brute-force attempt today, which is strictly better than no limit at all.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

/** Returns true if this key (email, or email+ip) is currently allowed to attempt a login. */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    return false;
  }
  return bucket.count >= MAX_ATTEMPTS;
}

/** Records a failed attempt for this key. */
export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }
  bucket.count += 1;
}

/** Clears the bucket for this key (call on a successful login). */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}
