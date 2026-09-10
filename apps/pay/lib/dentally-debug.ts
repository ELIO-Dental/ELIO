/** Dentally connection debug (legacy /api/dentally/debug, Y3.6). */

import { scopedDb } from "@elio/db";
import { getDentallyClientForPractice } from "@elio/dentally";
import { getPayPeriodBoundaries } from "@elio/pay-engine";
import { getPaySettings } from "./pay-settings-service";
import { resolveDentallySiteId } from "./pay-settings";
import { buildInvoiceListQueryParams } from "./dentally-fetch-invoices";
import {
  buildUnmatchedInvoiceIds,
  mapDentallyDebugUser,
  type DentallyDebugInvoiceUser,
  type DentallyDebugUser,
} from "./dentally-debug-helpers";

export type { DentallyDebugUser, DentallyDebugInvoiceUser } from "./dentally-debug-helpers";
export { buildUnmatchedInvoiceIds, mapDentallyDebugUser } from "./dentally-debug-helpers";

export interface DentallyDebugResult {
  site_id: string;
  dentally_users: DentallyDebugUser[];
  dentally_users_count: number;
  practitioners: DentallyDebugUser[] | string;
  invoice_user_ids: Record<string, DentallyDebugInvoiceUser>;
  unmatched_invoice_ids: Array<{ id: string; name?: string; count: number; totalAmount: number }>;
  stored_dentists: Array<{
    id: string;
    name: string;
    dentally_practitioner_id: string | null;
  }>;
  /** Non-fatal: a sub-fetch failed or was truncated. Surfaced so "0 users found" /
   *  an empty unmatched list can't be mistaken for a genuinely clean result. */
  warnings: string[];
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  return 0;
}

export async function runDentallyConnectionDebug(practiceId: string): Promise<DentallyDebugResult> {
  const paySettings = await getPaySettings(practiceId);
  const siteId = resolveDentallySiteId(paySettings);
  if (!siteId) {
    throw new Error("Dentally Site ID is not configured. Set it in Pay Settings.");
  }

  const db = scopedDb(practiceId);
  const dentists = await db.dentist.findMany({
    where: { practiceId },
    select: { id: true, name: true, dentallyPractitionerId: true },
    orderBy: { name: "asc" },
  });

  const client = await getDentallyClientForPractice(practiceId);
  const warnings: string[] = [];

  let dentallyUsers: DentallyDebugUser[] = [];
  try {
    await client.paginate<Record<string, unknown>>(
      "/users",
      "users",
      { site_id: siteId },
      (page) => {
        dentallyUsers.push(...page.map(mapDentallyDebugUser));
      }
    );
  } catch (err) {
    warnings.push(
      `Could not fetch Dentally users: ${err instanceof Error ? err.message : String(err)} — results below may be incomplete.`
    );
  }

  let practitioners: DentallyDebugUser[] = [];
  try {
    await client.paginate<Record<string, unknown>>(
      "/practitioners",
      "practitioners",
      { site_id: siteId },
      (page) => {
        practitioners.push(...page.map(mapDentallyDebugUser));
      }
    );
  } catch (err) {
    warnings.push(
      `Could not fetch Dentally practitioners: ${err instanceof Error ? err.message : String(err)} — results below may be incomplete.`
    );
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const prevPrevMonth = prevMonth === 1 ? 12 : prevMonth - 1;
  const prevPrevYear = prevMonth === 1 ? prevYear - 1 : prevYear;

  const dateRanges = [
    getPayPeriodBoundaries(prevMonth, prevYear),
    getPayPeriodBoundaries(prevPrevMonth, prevPrevYear),
  ];

  const invoiceUserIds: Record<string, DentallyDebugInvoiceUser> = {};

  for (const range of dateRanges) {
    try {
      // dated_on_after/dated_on_before, NOT dated_on_from/dated_on_to — see
      // buildInvoiceListQueryParams in dentally-fetch-invoices.ts (the working,
      // tested version of this same endpoint). The old from/to names were silently
      // ignored by Dentally, so this diagnostic was scanning unfiltered invoices
      // across the practice's whole history rather than the intended two-month
      // window — the exact "unmatched practitioner ID" counts this panel exists to
      // produce were built on the wrong data.
      const fetched = await client.paginate<Record<string, unknown>>(
        "/invoices",
        "invoices",
        buildInvoiceListQueryParams(siteId, range.startDate, range.endDate),
        (page) => {
          for (const inv of page) {
            const uid = String(inv.user_id ?? inv.practitioner_id ?? "");
            if (!uid) continue;
            if (!invoiceUserIds[uid]) invoiceUserIds[uid] = { count: 0, totalAmount: 0 };
            invoiceUserIds[uid].count++;
            invoiceUserIds[uid].totalAmount += parseAmount(inv.amount);
          }
        },
        { maxPages: 20 } // diagnostic tool, not a full sync — 2,000 invoices/range is generous
      );
      if (fetched >= 20 * 100) {
        warnings.push(
          `Invoice scan for ${range.startDate}–${range.endDate} hit its page cap — counts below may be incomplete for a very busy period.`
        );
      }
    } catch (err) {
      warnings.push(
        `Could not fetch invoices for ${range.startDate}–${range.endDate}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  for (const uid of Object.keys(invoiceUserIds)) {
    const matched = dentallyUsers.find((u) => u.id === uid);
    if (matched) invoiceUserIds[uid]!.name = matched.name;
  }

  const storedIds = new Set(dentists.map((d) => d.dentallyPractitionerId).filter(Boolean) as string[]);
  const unmatched = buildUnmatchedInvoiceIds(invoiceUserIds, storedIds);

  return {
    site_id: siteId,
    dentally_users: dentallyUsers.sort((a, b) => a.name.localeCompare(b.name)),
    dentally_users_count: dentallyUsers.length,
    practitioners: practitioners.length > 0 ? practitioners : "No practitioners endpoint or empty",
    invoice_user_ids: invoiceUserIds,
    unmatched_invoice_ids: unmatched,
    stored_dentists: dentists.map((d) => ({
      id: d.id,
      name: d.name,
      dentally_practitioner_id: d.dentallyPractitionerId,
    })),
    warnings,
  };
}
