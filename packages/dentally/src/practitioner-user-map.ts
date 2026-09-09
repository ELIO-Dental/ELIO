import type { DentallyClient } from "./client";

/** Dentally `/practitioners` list/detail shape (fields we need for id linking). */
export type DentallyPractitionerLinkRaw = {
  id: number | string;
  user_id?: number | string | null;
  user?: { id?: number | string | null } | null;
};

export function practitionerUserIdFromRaw(p: DentallyPractitionerLinkRaw): string | null {
  if (p.user_id != null && String(p.user_id).trim() !== "") return String(p.user_id);
  if (p.user?.id != null && String(p.user.id).trim() !== "") return String(p.user.id);
  return null;
}

const PRACTITIONER_MAP_TTL_MS = 60 * 60 * 1000;
const practitionerMapCache = new Map<string, { at: number; map: Map<string, string> }>();

/** Test-only: clear TTL cache between vitest cases. */
export function clearPractitionerUserIdMapCache(): void {
  practitionerMapCache.clear();
}

/**
 * Live Dentally (Aura 2026-09): invoice_item.practitioner_id is the
 * **practitioner resource id** (`/practitioners/{id}`), while ELIO dentists often
 * store Dentally **user.id** on `dentallyPractitionerId`. Build practitioner→user
 * so Pay/Flow can match either space.
 *
 * Cached per site for 1h so re-fetch / consecutive jobs do not burn Dentally rate limit.
 */
export async function fetchPractitionerUserIdMap(
  client: DentallyClient,
  siteId: string
): Promise<Map<string, string>> {
  const cached = practitionerMapCache.get(siteId);
  if (cached && Date.now() - cached.at < PRACTITIONER_MAP_TTL_MS) {
    return cached.map;
  }

  try {
    const map = new Map<string, string>();
    await client.paginate<DentallyPractitionerLinkRaw>(
      "/practitioners",
      "practitioners",
      { site_id: siteId },
      (page) => {
        for (const p of page) {
          const uid = practitionerUserIdFromRaw(p);
          if (!uid) continue;
          map.set(String(p.id), uid);
        }
      }
    );
    practitionerMapCache.set(siteId, { at: Date.now(), map });
    return map;
  } catch (err) {
    // Prefer stale map over failing the whole payslip fetch when rate-limited.
    if (cached?.map.size) {
      console.warn(
        `[dentally] practitioner map refresh failed for site=${siteId}; using stale cache (${cached.map.size} links)`,
        err instanceof Error ? err.message : err
      );
      return cached.map;
    }
    throw err;
  }
}

/**
 * Index dentists by every id that can appear on invoices:
 * stored dentallyPractitionerId (user or practitioner), plus the linked twin.
 */
export function expandDentistByPractitionerIds<T extends { dentallyPractitionerId: string | null }>(
  dentists: T[],
  practitionerToUser: Map<string, string>
): Map<string, T> {
  const byStored = new Map<string, T>();
  for (const d of dentists) {
    if (!d.dentallyPractitionerId) continue;
    byStored.set(String(d.dentallyPractitionerId), d);
  }
  const out = new Map(byStored);
  for (const [practitionerId, userId] of practitionerToUser) {
    const byUser = byStored.get(userId);
    if (byUser) out.set(practitionerId, byUser);
    const byPrac = byStored.get(practitionerId);
    if (byPrac) out.set(userId, byPrac);
  }
  return out;
}

/** Therapist settings may store user.id or practitioner resource id — accept both. */
export function expandIdSetWithPractitionerLinks(
  ids: Set<string>,
  practitionerToUser: Map<string, string>
): Set<string> {
  const out = new Set(ids);
  for (const [practitionerId, userId] of practitionerToUser) {
    if (ids.has(practitionerId)) out.add(userId);
    if (ids.has(userId)) out.add(practitionerId);
  }
  return out;
}
