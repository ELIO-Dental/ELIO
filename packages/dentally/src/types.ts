// Raw Dentally API response shapes (snake_case, as returned by api.dentally.co/v1).
// Only the fields ELIO actually consumes are typed — Dentally returns many more.
// Verified against the real API 2026-08-17 (see build report for Step 1.4).

export interface DentallyMeta {
  total?: number;
  page?: number;
  current_page?: number;
  total_pages?: number;
}

export interface DentallyPatientRaw {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  email_address?: string | null;
  mobile_phone?: string | null;
  home_phone?: string | null;
  site_id?: string | null;
  nhs_number?: string | null;
  payment_plan_id?: number | null;
  active?: boolean;
  updated_at?: string;
}

export interface DentallyAppointmentRaw {
  id: number;
  patient_id?: number | null;
  practitioner_id?: number | null;
  start_time?: string | null;
  finish_time?: string | null;
  duration?: number | null;
  state?: string | null;
  reason?: string | null;
  treatment_description?: string | null;
  site_id?: string | null;
  updated_at?: string;
}

export interface DentallyInvoiceItemRaw {
  id?: string | number;
  name?: string;
  amount?: string | number;
  quantity?: number;
  treatment_id?: number | string;
  // Real, structured field (per Dentally's official API reference) linking
  // an invoice line to the dentist who performed it — the reliable basis
  // for ElioPay §6.3 private-earnings attribution.
  practitioner_id?: number | string | null;
  // No fixed system vocabulary — resolves to a practice-defined category
  // name. Captured as-is; matched against a configurable practice setting,
  // never hardcoded/guessed (see normalize.ts).
  treatment_category?: string | null;
}

export interface DentallyInvoiceRaw {
  id: number;
  patient_id?: number | null;
  amount?: string | number;
  amount_outstanding?: string | number;
  dated_on?: string | null;
  paid?: boolean;
  site_id?: string | null;
  invoice_items?: DentallyInvoiceItemRaw[];
  updated_at?: string;
}

export interface DentallyTreatmentCatalogRaw {
  id: number;
  code?: string;
  description?: string;
  nomenclature?: string;
  nhs_treatment_cat?: string | null;
  uda_band?: number | null;
  treatment_category_id?: number | null;
}

export type DentallyListEnvelope<TKey extends string, TItem> = {
  [key in TKey]: TItem[];
} & { meta?: DentallyMeta };
