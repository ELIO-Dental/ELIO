/**
 * Patient identity matching for Dentally imports.
 *
 * Prefer the stable Dentally id, then fall back to a normalised email so
 * case/whitespace differences do not create duplicate records on every sync.
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
  existing: T[],
): MatchResult<T> {
  if (candidate.dentallyId) {
    const byId = existing.find((p) => p.dentallyId === candidate.dentallyId);
    if (byId) return { match: byId, matchedBy: "dentallyId" };
  }

  const email = normalizeEmail(candidate.email);
  if (email) {
    const byEmail = existing.find((p) => normalizeEmail(p.email) === email);
    if (byEmail) return { match: byEmail, matchedBy: "email" };
  }

  return { match: null, matchedBy: null };
}
