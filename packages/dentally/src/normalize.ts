// Maps raw Dentally API records (snake_case) onto ELIO's synced-core Prisma
// input shape (packages/db, models Patient/Appointment/Treatment/Invoice).
// Kept separate from sync.ts so the mapping is unit-testable without a DB.

import type {
  DentallyAppointmentRaw,
  DentallyInvoiceRaw,
  DentallyPatientRaw,
  DentallyPaymentRaw,
  DentallyAccountRaw,
  DentallyPaymentPlanRaw,
} from "./types";

export function normalizePatient(raw: DentallyPatientRaw) {
  return {
    dentallyId: String(raw.id),
    firstName: raw.first_name ?? null,
    lastName: raw.last_name ?? null,
    dateOfBirth: raw.date_of_birth ? new Date(raw.date_of_birth) : null,
    email: raw.email_address ?? null,
    phone: raw.mobile_phone ?? raw.home_phone ?? null,
  };
}

export function normalizeAppointment(raw: DentallyAppointmentRaw) {
  return {
    dentallyId: String(raw.id),
    dentallyPatientId: raw.patient_id != null ? String(raw.patient_id) : null,
    startsAt: raw.start_time ? new Date(raw.start_time) : null,
    endsAt: raw.finish_time ? new Date(raw.finish_time) : null,
    // Already present on the raw API response (DentallyAppointmentRaw) but
    // previously discarded — Step 1.8 (ElioFlow) needs `reason` to identify
    // "Cosmetic Consultation" appointments, the same field the old
    // standalone ElioFlow app filtered its entire dataset on.
    dentallyState: raw.state ?? null,
    reason: raw.reason ?? null,
    practitionerId: raw.practitioner_id != null ? String(raw.practitioner_id) : null,
  };
}

/**
 * Dentally has no single "completed treatment" endpoint that maps 1:1 to
 * ELIO's `Treatment` model — treatments are represented as invoice line items
 * tied to a patient/date. Each priced invoice item becomes one Treatment row,
 * `dentallyId` composed as `${invoiceId}:${itemId}` so it's stable and unique
 * per practice. `completedAt` uses the invoice's `dated_on` (the closest
 * available proxy for when the treatment was delivered/billed).
 */
export function normalizeTreatmentsFromInvoice(raw: DentallyInvoiceRaw) {
  const completedAt = raw.dated_on ? new Date(raw.dated_on) : null;
  const items = raw.invoice_items ?? [];
  if (items.length === 0) {
    // No line items on this invoice — still record it as a single treatment
    // row so the amount isn't lost, keyed on the invoice id itself.
    return [
      {
        dentallyId: String(raw.id),
        dentallyPatientId: raw.patient_id != null ? String(raw.patient_id) : null,
        completedAt,
        amountPence: raw.amount != null ? toPence(raw.amount) : null,
        dentallyPractitionerId: null,
        dentallyTreatmentCategory: null,
      },
    ];
  }
  return items.map((item, index) => ({
    dentallyId: `${raw.id}:${item.id ?? index}`,
    dentallyPatientId: raw.patient_id != null ? String(raw.patient_id) : null,
    completedAt,
    amountPence: item.amount != null ? toPence(item.amount) : null,
    dentallyPractitionerId:
      item.practitioner_id != null ? String(item.practitioner_id) : null,
    dentallyTreatmentCategory: item.treatment_category ?? null,
  }));
}

export function normalizeInvoice(raw: DentallyInvoiceRaw) {
  return {
    dentallyId: String(raw.id),
    dentallyPatientId: raw.patient_id != null ? String(raw.patient_id) : null,
    totalPence: raw.amount != null ? toPence(raw.amount) : null,
  };
}

export function normalizePayment(raw: DentallyPaymentRaw) {
  const amount = raw.total ?? raw.amount;
  const paidAtSource = raw.dated_on ?? raw.created_at;
  return {
    dentallyId: String(raw.id),
    dentallyPatientId: raw.patient_id != null ? String(raw.patient_id) : null,
    amountPence: amount != null ? toPence(amount) : null,
    paidAt: paidAtSource ? new Date(paidAtSource) : null,
  };
}

export function normalizeAccount(raw: DentallyAccountRaw) {
  return {
    dentallyId: String(raw.id),
    dentallyPatientId: raw.patient_id != null ? String(raw.patient_id) : null,
    currentBalancePence: raw.current_balance != null ? toPence(raw.current_balance) : null,
    plannedPrivateTreatmentValuePence:
      raw.planned_private_treatment_value != null ? toPence(raw.planned_private_treatment_value) : null,
    plannedNhsTreatmentValuePence:
      raw.planned_nhs_treatment_value != null ? toPence(raw.planned_nhs_treatment_value) : null,
  };
}

export function normalizePaymentPlan(raw: DentallyPaymentPlanRaw) {
  return {
    dentallyId: String(raw.id),
    name: raw.name?.trim() || `Plan ${raw.id}`,
    patientFriendlyName: raw.patient_friendly_name?.trim() || null,
    active: raw.active !== false,
    siteId: raw.site_id ?? null,
    colour: raw.colour ?? null,
  };
}

function toPence(amount: string | number): number {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}
