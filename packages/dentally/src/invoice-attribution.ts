import type { DentallyInvoiceRaw } from "./types";

/**
 * Dentally invoice line `practitioner_id` is the practitioner's **user.id**,
 * not the practitioner resource's top-level `id` (PDF §2 / known AuraPay bug).
 *
 * Prefer line item → invoice.user_id → invoice.practitioner_id.
 */
export function resolveInvoicePractitionerUserId(inv: DentallyInvoiceRaw): string {
  const fromLine = inv.invoice_items?.find((item) => item.practitioner_id != null)?.practitioner_id;
  const raw = fromLine ?? inv.user_id ?? inv.practitioner_id;
  return raw != null ? String(raw) : "";
}
