/**
 * PDF §4.5 — unmapped practitioner ids must not invent dentists or vanish silently.
 * Visible on ops review (period page), never in associate gross.
 */

export interface UnmappedPractitionerHit {
  practitionerId: string;
  amountPence: number;
  treatment: string;
  invoiceDate: string;
  invoiceId?: string;
  patientName?: string;
  patientId?: string;
}

export function recordUnmappedPractitioner(
  hits: Map<string, UnmappedPractitionerHit>,
  hit: UnmappedPractitionerHit
): void {
  const id = hit.practitionerId.trim();
  if (!id) return;
  const prev = hits.get(id);
  if (!prev) {
    hits.set(id, { ...hit, practitionerId: id });
    return;
  }
  // Keep first sample treatment/date; accumulate amount for ops visibility.
  hits.set(id, {
    ...prev,
    amountPence: prev.amountPence + hit.amountPence,
  });
}

export function unmappedHitsToList(
  hits: Map<string, UnmappedPractitionerHit>
): UnmappedPractitionerHit[] {
  return Array.from(hits.values()).sort((a, b) =>
    a.practitionerId.localeCompare(b.practitionerId)
  );
}

/** Discrepancy rows for review UI (not paid to any dentist). */
export function unmappedHitsToDiscrepancies(hits: UnmappedPractitionerHit[]): Array<{
  type: "unmapped_practitioner";
  patientName: string;
  invoicedAmount: number;
  paidAmount: number;
  date: string;
  notes: string;
  treatment?: string;
  practitionerId: string;
  invoiceId?: string;
  patientId?: string;
}> {
  return hits.map((h) => ({
    type: "unmapped_practitioner" as const,
    patientName: h.patientName?.trim() || `Unmapped practitioner ${h.practitionerId}`,
    invoicedAmount: h.amountPence / 100,
    paidAmount: 0,
    date: h.invoiceDate,
    notes: `Unmapped Dentally practitioner_id ${h.practitionerId} — set dentallyPractitionerId on a dentist. Not in gross.`,
    treatment: h.treatment || undefined,
    practitionerId: h.practitionerId,
    invoiceId: h.invoiceId,
    patientId: h.patientId,
  }));
}

/** Parse durable unmapped hits from persisted fetch result JSON (period page). */
export function parseUnmappedFromFetchResult(result: unknown): UnmappedPractitionerHit[] {
  if (!result || typeof result !== "object") return [];
  const debug = (result as { debug?: unknown }).debug;
  if (!debug || typeof debug !== "object") return [];
  const d = debug as {
    unmappedPractitioners?: unknown;
    unmatchedClinicianIds?: unknown;
  };
  if (Array.isArray(d.unmappedPractitioners)) {
    return d.unmappedPractitioners.filter(
      (h): h is UnmappedPractitionerHit =>
        Boolean(
          h &&
            typeof h === "object" &&
            typeof (h as UnmappedPractitionerHit).practitionerId === "string"
        )
    );
  }
  // Legacy fetch results: ids only
  if (!Array.isArray(d.unmatchedClinicianIds)) return [];
  return d.unmatchedClinicianIds
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((practitionerId) => ({
      practitionerId,
      amountPence: 0,
      treatment: "",
      invoiceDate: "",
    }));
}

