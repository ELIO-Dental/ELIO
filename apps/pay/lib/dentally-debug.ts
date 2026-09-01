/** Dentally connection debug (legacy /api/dentally/debug, Y3.6). */

import { scopedDb } from "@elio/db";
import { getDentallyClientForPractice } from "@elio/dentally";
import { getPayPeriodBoundaries } from "@elio/pay-engine";
import { getPaySettings } from "./pay-settings-service";
import { resolveDentallySiteId } from "./pay-settings";

export interface DentallyDebugUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export interface DentallyDebugInvoiceUser {
  count: number;
  totalAmount: number;
  name?: string;
}

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
}

function mapUser(raw: Record<string, unknown>): DentallyDebugUser {
  const first = String(raw.first_name ?? "");
  const last = String(raw.last_name ?? "");
  const name = `${first} ${last}`.trim() || String(raw.name ?? raw.email ?? "Unknown");
  return {
    id: String(raw.id),
    name,
    email: String(raw.email ?? ""),
    role: String(raw.role ?? raw.user_type ?? raw.job_title ?? raw.practitioner_type ?? ""),
    active: raw.active !== false && raw.status !== "inactive",
  };
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

  let dentallyUsers: DentallyDebugUser[] = [];
  try {
    const usersData = await client.get<Record<string, unknown>>("/users", { site_id: siteId, per_page: 100 });
    const users = (usersData.users ?? usersData.data ?? []) as Record<string, unknown>[];
    dentallyUsers = users.map(mapUser);
  } catch {
    dentallyUsers = [];
  }

  let practitioners: DentallyDebugUser[] = [];
  try {
    const pracData = await client.get<Record<string, unknown>>("/practitioners", { site_id: siteId, per_page: 100 });
    const pracs = (pracData.practitioners ?? pracData.data ?? []) as Record<string, unknown>[];
    practitioners = pracs.map(mapUser);
  } catch {
    practitioners = [];
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
      const raw = await client.get<Record<string, unknown>>("/invoices", {
        site_id: siteId,
        dated_on_from: range.startDate,
        dated_on_to: range.endDate,
        per_page: 50,
      });
      const invoices = (raw.invoices ?? raw.data ?? []) as Array<Record<string, unknown>>;
      for (const inv of invoices) {
        const uid = String(inv.user_id ?? inv.practitioner_id ?? "");
        if (!uid) continue;
        if (!invoiceUserIds[uid]) invoiceUserIds[uid] = { count: 0, totalAmount: 0 };
        invoiceUserIds[uid].count++;
        invoiceUserIds[uid].totalAmount += parseAmount(inv.amount);
      }
    } catch {
      // continue with other range
    }
  }

  for (const uid of Object.keys(invoiceUserIds)) {
    const matched = dentallyUsers.find((u) => u.id === uid);
    if (matched) invoiceUserIds[uid]!.name = matched.name;
  }

  const storedIds = new Set(dentists.map((d) => d.dentallyPractitionerId).filter(Boolean) as string[]);
  const unmatched = Object.entries(invoiceUserIds)
    .filter(([uid]) => !storedIds.has(uid))
    .map(([id, data]) => ({ id, name: data.name, count: data.count, totalAmount: data.totalAmount }))
    .sort((a, b) => b.count - a.count);

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
  };
}
