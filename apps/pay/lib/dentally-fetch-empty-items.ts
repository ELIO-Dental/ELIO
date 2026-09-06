/**
 * Empty invoice_items fallback attribution (Steps 11–12).
 * Must never put therapist or unmapped practitioners into associate gross.
 */

export type EmptyInvoiceAttribution =
  | { action: "skip"; reason: "MISSING_PRACTITIONER" }
  | { action: "skip"; reason: "THERAPIST_LINE" }
  | { action: "skip"; reason: "NON_CLINICIAN" }
  | { action: "unmapped"; practitionerId: string }
  | { action: "attribute"; dentistId: string; practitionerId: string };

export function attributeEmptyInvoicePractitioner(input: {
  practitionerId: string | null | undefined;
  therapistIds: Set<string>;
  dentistIdByPractitioner: Map<string, string>;
  isNonClinician?: boolean;
}): EmptyInvoiceAttribution {
  const practitionerId = input.practitionerId?.trim() || "";
  if (!practitionerId) {
    return { action: "skip", reason: "MISSING_PRACTITIONER" };
  }
  if (input.therapistIds.has(practitionerId)) {
    return { action: "skip", reason: "THERAPIST_LINE" };
  }
  if (input.isNonClinician) {
    return { action: "skip", reason: "NON_CLINICIAN" };
  }
  const dentistId = input.dentistIdByPractitioner.get(practitionerId);
  if (!dentistId) {
    return { action: "unmapped", practitionerId };
  }
  return { action: "attribute", dentistId, practitionerId };
}
