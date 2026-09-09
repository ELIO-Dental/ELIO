import type { DentallyInvoiceRaw } from "./types";

/**
 * Raw practitioner id from an invoice (line → user_id → invoice.practitioner_id).
 *
 * Live Dentally (Aura 2026-09): invoice_item.practitioner_id is usually the
 * **practitioner resource id** (`/practitioners/{id}`), while ELIO dentists often
 * store Dentally **user.id**. Callers that match dentists must expand via
 * `fetchPractitionerUserIdMap` / `expandDentistByPractitionerIds` — do not assume
 * this return value is already a user.id.
 */
export function resolveInvoicePractitionerUserId(inv: DentallyInvoiceRaw): string {
  const fromLine = inv.invoice_items?.find((item) => item.practitioner_id != null)?.practitioner_id;
  const raw = fromLine ?? inv.user_id ?? inv.practitioner_id;
  return raw != null ? String(raw) : "";
}
