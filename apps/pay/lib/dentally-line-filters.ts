import type { DentallyInvoiceItemRaw, DentallyInvoiceRaw } from "@elio/dentally";
import { isInvoiceFullyPaid, parseInvoiceAmount } from "./dentally-fetch-invoices";

/** Default practice-owned exclusions (PDF §4.1) — overridable via ctx.excludedTreatments. */
export const DEFAULT_EXCLUDED_TREATMENTS = ["cbct", "ct scan", "cone beam"] as const;

export const DEFAULT_NHS_KEYWORDS = [
  "band 1",
  "band 2",
  "band 3",
  "nhs exam",
  "nhs scale",
  "nhs polish",
  "nhs fluoride",
  "nhs fissure",
  "urgent dental",
  "nhs urgent",
  "nhs extraction",
  "nhs filling",
  "nhs root",
] as const;

export type LineExcludeReason =
  | "EXCLUDED_TREATMENT"
  | "NHS_CHARGE"
  | "NHS_PLAN"
  | "NHS_KEYWORD"
  | "NHS_BAND_PRICE"
  | "ZERO_PRICE"
  | "THERAPIST_LINE"
  | "UNMAPPED_PRACTITIONER"
  | "MISSING_PRACTITIONER";

export type LineFlagReason = "NOT_FULLY_PAID";

export type ClassifyPrivateLineResult =
  | { action: "exclude"; reason: LineExcludeReason }
  | { action: "flag"; reason: LineFlagReason; practitionerUserId: string; amountPence: number; name: string }
  | {
      action: "keep";
      practitionerUserId: string;
      amountPence: number;
      name: string;
    };

export interface ClassifyPrivateLineContext {
  excludedTreatments: string[];
  nhsKeywords: string[];
  /** Band amounts in £ (will compare in pence ±1). */
  nhsBandAmountsGbp: number[];
  therapistIds: Set<string>;
  /** Dentally user.id → ELIO dentist id (mapped associates only). */
  dentistIdByUserId: Map<string, string>;
}

function lineAmountGbp(item: DentallyInvoiceItemRaw): number {
  return parseInvoiceAmount(item.total_price ?? item.amount);
}

function toPence(gbp: number): number {
  return Math.round(gbp * 100);
}

function nameMatchesExcluded(name: string, phrases: string[]): boolean {
  const lower = name.toLowerCase();
  return phrases.some((p) => {
    const phrase = p.trim().toLowerCase();
    return phrase.length > 0 && lower.includes(phrase);
  });
}

function priceNearNhsBand(amountPence: number, bandGbp: number[]): boolean {
  return bandGbp.some((gbp) => Math.abs(amountPence - toPence(gbp)) <= 1);
}

/**
 * PDF §4 ordered filter — short-circuit on first exclusion.
 * Survivors (`keep`) enter gross; `flag` = payment-flag path (not gross).
 */
export function classifyPrivateLine(
  item: DentallyInvoiceItemRaw & { nhs_charge?: boolean; payment_type?: string; payment_plan?: string },
  invoice: Pick<
    DentallyInvoiceRaw,
    "paid" | "balance" | "amount_outstanding"
  > & {
    payment_type?: string | null;
    payment_plan?: string | null;
    payment_plan_name?: string | null;
  },
  ctx: ClassifyPrivateLineContext
): ClassifyPrivateLineResult {
  const name = item.name || "";
  const amountGbp = lineAmountGbp(item);
  const amountPence = toPence(amountGbp);

  // 1 §4.1 excluded treatments
  if (nameMatchesExcluded(name, ctx.excludedTreatments)) {
    return { action: "exclude", reason: "EXCLUDED_TREATMENT" };
  }

  // 2 §4.2 NHS
  if (item.nhs_charge === true) {
    return { action: "exclude", reason: "NHS_CHARGE" };
  }
  // Item fields rarely populated — also check invoice-level plan/type (revision1 §4.2).
  const planBlob = `${item.payment_type ?? ""} ${item.payment_plan ?? ""} ${
    invoice.payment_type ?? ""
  } ${invoice.payment_plan ?? ""} ${invoice.payment_plan_name ?? ""}`.toLowerCase();
  if (planBlob.includes("nhs")) {
    return { action: "exclude", reason: "NHS_PLAN" };
  }
  if (nameMatchesExcluded(name, ctx.nhsKeywords)) {
    return { action: "exclude", reason: "NHS_KEYWORD" };
  }
  if (priceNearNhsBand(amountPence, ctx.nhsBandAmountsGbp)) {
    return { action: "exclude", reason: "NHS_BAND_PRICE" };
  }
  if (amountPence === 0) {
    return { action: "exclude", reason: "ZERO_PRICE" };
  }

  const practitionerUserId =
    item.practitioner_id != null ? String(item.practitioner_id) : "";

  // 3 §4.3 payment — unpaid → flag path (still need practitioner for display)
  if (!isInvoiceFullyPaid(invoice)) {
    if (!practitionerUserId) return { action: "exclude", reason: "MISSING_PRACTITIONER" };
    if (ctx.therapistIds.has(practitionerUserId)) {
      return { action: "exclude", reason: "THERAPIST_LINE" };
    }
    if (!ctx.dentistIdByUserId.has(practitionerUserId)) {
      return { action: "exclude", reason: "UNMAPPED_PRACTITIONER" };
    }
    return {
      action: "flag",
      reason: "NOT_FULLY_PAID",
      practitionerUserId,
      amountPence,
      name,
    };
  }

  // 4 §4.4 therapist
  if (!practitionerUserId) {
    return { action: "exclude", reason: "MISSING_PRACTITIONER" };
  }
  if (ctx.therapistIds.has(practitionerUserId)) {
    return { action: "exclude", reason: "THERAPIST_LINE" };
  }

  // 5 §4.5 unmapped
  if (!ctx.dentistIdByUserId.has(practitionerUserId)) {
    return { action: "exclude", reason: "UNMAPPED_PRACTITIONER" };
  }

  return {
    action: "keep",
    practitionerUserId,
    amountPence,
    name,
  };
}

export function defaultClassifyContext(partial: {
  nhsBandAmountsGbp?: number[];
  therapistIds?: Set<string>;
  dentistIdByUserId: Map<string, string>;
  excludedTreatments?: string[];
  nhsKeywords?: string[];
}): ClassifyPrivateLineContext {
  return {
    excludedTreatments: partial.excludedTreatments ?? [...DEFAULT_EXCLUDED_TREATMENTS],
    nhsKeywords: partial.nhsKeywords ?? [...DEFAULT_NHS_KEYWORDS],
    nhsBandAmountsGbp: partial.nhsBandAmountsGbp ?? [],
    therapistIds: partial.therapistIds ?? new Set(),
    dentistIdByUserId: partial.dentistIdByUserId,
  };
}
