import type { DentallyClient, DentallyInvoiceItemRaw, DentallyInvoiceRaw } from "@elio/dentally";
import { parseInvoiceAmount } from "./dentally-fetch-invoices";

const CBCT_KEYWORDS = ["cbct", "ct scan", "cone beam"];
const NHS_KEYWORDS = [
  "band 1",
  "band 2",
  "band 3",
  "nhs exam",
  "nhs scale",
  "nhs polish",
  "nhs fluoride",
  "nhs fissure",
  "urgent dental",
  "nhs extraction",
  "nhs filling",
  "nhs root",
];

export interface PrivateLineAttribution {
  practitionerUserId: string;
  amount: number;
  name: string;
  item: DentallyInvoiceItemRaw;
}

function isNhsAmount(amountGbp: number, nhsAmountsGbp: Set<number>): boolean {
  const amountPence = Math.round(amountGbp * 100);
  for (const nhsAmt of nhsAmountsGbp) {
    if (Math.abs(amountPence - Math.round(nhsAmt * 100)) <= 1) return true;
  }
  return false;
}

function isNhsLineItem(
  item: DentallyInvoiceItemRaw & { nhs_charge?: boolean },
  nhsAmounts: Set<number>
): boolean {
  if (item.nhs_charge) return true;
  const lower = (item.name || "").toLowerCase();
  if (NHS_KEYWORDS.some((k) => lower.includes(k))) return true;
  return isNhsAmount(parseInvoiceAmount(item.amount), nhsAmounts);
}

function isCbctLineItem(item: DentallyInvoiceItemRaw): boolean {
  const lower = (item.name || "").toLowerCase();
  return CBCT_KEYWORDS.some((k) => lower.includes(k));
}

function lineAmount(item: DentallyInvoiceItemRaw): number {
  // Dentally detail uses total_price; list envelopes often use amount.
  const raw = item.total_price ?? item.amount;
  return parseInvoiceAmount(raw);
}

/**
 * Ensure invoice_items are present (PDF §3.3 — GET /invoices/{id} when list payload is thin).
 */
export async function hydrateInvoiceItems(
  client: DentallyClient,
  inv: DentallyInvoiceRaw
): Promise<DentallyInvoiceRaw> {
  const items = inv.invoice_items ?? [];
  const needsHydrate =
    items.length === 0 ||
    items.some(
      (it) =>
        it.practitioner_id == null ||
        ((it.total_price == null || Number(it.total_price) === 0) &&
          (it.amount == null || Number(it.amount) === 0))
    );
  if (!needsHydrate) return inv;
  try {
    const data = await client.get<{ invoice?: DentallyInvoiceRaw }>(`/invoices/${inv.id}`);
    if (data.invoice) {
      return {
        ...inv,
        ...data.invoice,
        invoice_items: data.invoice.invoice_items ?? inv.invoice_items,
      };
    }
  } catch {
    // keep list payload
  }
  return inv;
}

/**
 * Attribute private revenue per line `practitioner_id` (Dentally user.id).
 * Dual-clinician invoices split across dentists — never lump to first line only.
 */
export function privateLinesByPractitioner(
  inv: DentallyInvoiceRaw,
  nhsAmounts: Set<number>,
  therapistIds: Set<string> = new Set()
): { lines: PrivateLineAttribution[]; skippedNhs: number; skippedTherapist: number } {
  const items = inv.invoice_items ?? [];
  const lines: PrivateLineAttribution[] = [];
  let skippedNhs = 0;
  let skippedTherapist = 0;

  if (items.length === 0) {
    return { lines, skippedNhs, skippedTherapist };
  }

  for (const item of items) {
    const amount = lineAmount(item);
    if (amount <= 0) continue;
    if (isCbctLineItem(item) || isNhsLineItem(item, nhsAmounts)) {
      skippedNhs++;
      continue;
    }
    const practitionerUserId =
      item.practitioner_id != null ? String(item.practitioner_id) : "";
    if (!practitionerUserId) continue;
    if (therapistIds.has(practitionerUserId)) {
      skippedTherapist++;
      continue;
    }
    lines.push({
      practitionerUserId,
      amount,
      name: item.name || "",
      item,
    });
  }

  return { lines, skippedNhs, skippedTherapist };
}
