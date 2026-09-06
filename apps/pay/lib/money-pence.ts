/**
 * Step 20 — integer money helpers (basis points, no float currency shares).
 * SHARE_SCALE: 10000 = 100% (5000 = 50%).
 * RATE_SCALE: 10000 = 100% (800 = 8%).
 */

export const SHARE_SCALE = 10_000;
export const RATE_SCALE = 10_000;

/** Apply share: totalPence × shareBp / 10000, rounded. */
export function applySharePence(totalPence: number, shareBp: number): number {
  if (!(totalPence > 0) || !(shareBp > 0)) return 0;
  return Math.round((totalPence * shareBp) / SHARE_SCALE);
}

/**
 * Settings strings: "0.5" or "50" → 5000 bp.
 * Values in (0,1] treated as fractions; (1,100] as percent.
 */
export function parseShareToBasisPoints(raw: string | number | null | undefined, fallbackBp = 5000): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return fallbackBp;
  if (n === 0) return 0;
  if (n <= 1) return Math.round(n * SHARE_SCALE);
  if (n <= 100) return Math.round(n * 100);
  return fallbackBp;
}

/**
 * Finance term rates: "0.08" or "8" → 800 bp (8%).
 */
export function parseRateToBasisPoints(raw: string | number | null | undefined, fallbackBp = 0): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0) return fallbackBp;
  if (n === 0) return 0;
  if (n <= 1) return Math.round(n * RATE_SCALE);
  if (n <= 100) return Math.round(n * 100);
  return fallbackBp;
}

/** Pounds string/number → integer pence. */
export function toPence(pounds: string | number | null | undefined): number {
  const n = typeof pounds === "number" ? pounds : parseFloat(String(pounds ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
