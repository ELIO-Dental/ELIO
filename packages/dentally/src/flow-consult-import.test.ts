import { describe, expect, it } from "vitest";
import {
  resolveConsultBookedBy,
  shouldMarkPractitionerEdited,
  shouldUpdatePractitionerFromSync,
} from "./flow-consult-import";
import { mergeConsultFinancialUpdate } from "./flow-financial-merge";

describe("resolveConsultBookedBy", () => {
  it("trims and returns null for empty values", () => {
    expect(resolveConsultBookedBy("  Reception  ")).toBe("Reception");
    expect(resolveConsultBookedBy("")).toBeNull();
    expect(resolveConsultBookedBy(null)).toBeNull();
  });
});

describe("shouldUpdatePractitionerFromSync", () => {
  it("allows fill when practitioner not edited and empty", () => {
    expect(
      shouldUpdatePractitionerFromSync(
        { practitionerDentistId: null, practitionerEdited: false },
        "dentist-1"
      )
    ).toBe(true);
  });

  it("blocks overwrite when practitioner was manually edited", () => {
    expect(
      shouldUpdatePractitionerFromSync(
        { practitionerDentistId: "dentist-1", practitionerEdited: true },
        "dentist-2"
      )
    ).toBe(false);
  });

  it("blocks overwrite when practitioner already set", () => {
    expect(
      shouldUpdatePractitionerFromSync(
        { practitionerDentistId: "dentist-1", practitionerEdited: false },
        "dentist-2"
      )
    ).toBe(false);
  });
});

describe("shouldMarkPractitionerEdited", () => {
  it("is true only when dentist id changes", () => {
    expect(shouldMarkPractitionerEdited("a", "b")).toBe(true);
    expect(shouldMarkPractitionerEdited("a", "a")).toBe(false);
    expect(shouldMarkPractitionerEdited(null, null)).toBe(false);
  });
});

describe("mergeConsultFinancialUpdate", () => {
  const existing = {
    totalPaidPence: 197_000_000,
    hasDeposit: true,
    treatmentBooked: true,
    quotePence: 1_000_00,
    quotePenceOverride: null as number | null,
  };

  it("does not wipe paid/deposit when payment cache is empty", () => {
    const patch = mergeConsultFinancialUpdate(
      existing,
      { totalPaidPence: 0, hasDeposit: false, treatmentBooked: false },
      { hasPaymentRows: false, hasAppointmentRows: false, hasAccountRow: false }
    );
    expect(patch.totalPaidPence).toBeUndefined();
    expect(patch.hasDeposit).toBeUndefined();
  });

  it("updates paid/deposit when payment rows exist", () => {
    const patch = mergeConsultFinancialUpdate(
      existing,
      { totalPaidPence: 50_000, hasDeposit: true, treatmentBooked: false },
      { hasPaymentRows: true, hasAppointmentRows: true, hasAccountRow: false }
    );
    expect(patch.totalPaidPence).toBe(50_000);
    expect(patch.hasDeposit).toBe(true);
  });

  it("keeps treatmentBooked sticky-true when appointments exist", () => {
    const patch = mergeConsultFinancialUpdate(
      existing,
      { totalPaidPence: 0, hasDeposit: false, treatmentBooked: false },
      { hasPaymentRows: true, hasAppointmentRows: true, hasAccountRow: false }
    );
    expect(patch.treatmentBooked).toBe(true);
  });

  it("sets treatmentBooked true when computed true even without prior rows", () => {
    const patch = mergeConsultFinancialUpdate(
      { ...existing, treatmentBooked: false },
      { totalPaidPence: 0, hasDeposit: false, treatmentBooked: true },
      { hasPaymentRows: false, hasAppointmentRows: false, hasAccountRow: false }
    );
    expect(patch.treatmentBooked).toBe(true);
  });

  it("updates quote from account when no override", () => {
    const patch = mergeConsultFinancialUpdate(
      existing,
      { totalPaidPence: 0, hasDeposit: false, treatmentBooked: false, quotePence: 99_00 },
      { hasPaymentRows: false, hasAppointmentRows: false, hasAccountRow: true }
    );
    expect(patch.quotePence).toBe(99_00);
  });
});
