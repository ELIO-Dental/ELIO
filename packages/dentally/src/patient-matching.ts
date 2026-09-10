/**
 * Patient identity matching for Dentally imports.
 *
 * Prefer the stable Dentally id, then fall back to email only when the existing
 * row has no real Dentally id (null / blank / `manual:…`). Never hijack a row
 * that already belongs to a different Dentally patient.
 */

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const cleaned = email.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  return na !== null && na === nb;
}

/** Manual / empty ids are placeholders — safe to relink to a real Dentally id. */
export function isPlaceholderDentallyId(dentallyId: string | null | undefined): boolean {
  if (dentallyId == null) return true;
  const trimmed = String(dentallyId).trim();
  if (!trimmed) return true;
  return trimmed.startsWith("manual:");
}

export type MatchableExisting = {
  id: string;
  email: string | null;
  dentallyId: string | null;
};

export type MatchCandidate = {
  dentallyId?: string | null;
  email?: string | null;
};

export type MatchResult<T> = {
  match: T | null;
  matchedBy: "dentallyId" | "email" | null;
};

export function findExistingPatient<T extends MatchableExisting>(
  candidate: MatchCandidate,
  existing: T[]
): MatchResult<T> {
  if (candidate.dentallyId) {
    const byId = existing.find((p) => p.dentallyId === candidate.dentallyId);
    if (byId) return { match: byId, matchedBy: "dentallyId" };
  }

  const email = normalizeEmail(candidate.email);
  if (email) {
    const byEmail = existing.find((p) => normalizeEmail(p.email) === email);
    if (byEmail) {
      // Only email-match placeholder rows (manual patients / missing id).
      if (isPlaceholderDentallyId(byEmail.dentallyId)) {
        return { match: byEmail, matchedBy: "email" };
      }
      // Existing real Dentally id ≠ candidate → do not merge (create separate row).
      return { match: null, matchedBy: null };
    }
  }

  return { match: null, matchedBy: null };
}
