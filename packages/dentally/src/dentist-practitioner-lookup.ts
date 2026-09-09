/**
 * Resolve Dentally practitioner / user ids to ELIO Dentist rows.
 * Invoice items and appointments use practitioner resource ids; dentists may
 * store either resource id or user.id — expand via practitioner→user map.
 */

import { prisma } from "@elio/db";
import {
  expandDentistByPractitionerIds,
  fetchPractitionerUserIdMap,
} from "./practitioner-user-map";

export function siteIdFromPaySettingsJson(paySettingsJson: unknown): string | null {
  if (!paySettingsJson || typeof paySettingsJson !== "object") return null;
  const raw = (paySettingsJson as Record<string, unknown>).dentally_site_id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/** dentistId keyed by every Dentally id that may appear on appointments/invoices. */
export async function buildDentistIdByPractitionerLookup(
  practiceId: string
): Promise<Map<string, string>> {
  const dentists = await prisma.dentist.findMany({
    where: { practiceId, dentallyPractitionerId: { not: null } },
    select: { id: true, dentallyPractitionerId: true },
  });

  let practitionerToUser = new Map<string, string>();
  try {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { paySettingsJson: true },
    });
    const siteId =
      siteIdFromPaySettingsJson(practice?.paySettingsJson) ||
      process.env.DENTALLY_SITE_ID?.trim() ||
      null;
    if (siteId) {
      const { getDentallyClientForPractice } = await import("./resolve-api-key");
      const client = await getDentallyClientForPractice(practiceId);
      practitionerToUser = await fetchPractitionerUserIdMap(client, siteId);
    }
  } catch (err) {
    console.warn(
      `[dentally] dentist lookup map: practitioner→user unavailable practice=${practiceId}`,
      err instanceof Error ? err.message : err
    );
  }

  const expanded = expandDentistByPractitionerIds(dentists, practitionerToUser);
  const out = new Map<string, string>();
  for (const [key, dentist] of expanded) {
    out.set(key, dentist.id);
  }
  return out;
}

export function lookupDentistId(
  lookup: Map<string, string>,
  dentallyPractitionerId: string | null | undefined
): string | null {
  if (dentallyPractitionerId == null) return null;
  const key = String(dentallyPractitionerId).trim();
  if (!key) return null;
  return lookup.get(key) ?? null;
}
