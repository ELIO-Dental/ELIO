import { describe, expect, it } from "vitest";
import {
  dentistRateSnapshot,
  dentistRatesUpdatedEvent,
  financeLineUpdatedEvent,
  payslipEditAuditEvents,
} from "./pay-audit";

describe("pay audit events (Step 31)", () => {
  it("split/rate change creates pay.dentist.rates_updated with before/after", () => {
    const before = dentistRateSnapshot({
      privateSplitPercent: 50,
      udaRatePence: 2800,
      hourlyRatePence: null,
      labShareBp: 5000,
      financeShareBp: 5000,
      therapyHourlyPence: 3500,
    });
    const after = dentistRateSnapshot({
      ...before,
      privateSplitPercent: 55,
    });
    const event = dentistRatesUpdatedEvent("d-1", before, after, "new associate deal");
    expect(event).toEqual({
      action: "pay.dentist.rates_updated",
      targetType: "Dentist",
      targetId: "d-1",
      metadata: {
        before,
        after,
        reason: "new associate deal",
      },
    });
  });

  it("unchanged rates produce no dentist audit event", () => {
    const snap = dentistRateSnapshot({
      privateSplitPercent: 50,
      udaRatePence: 2800,
      hourlyRatePence: null,
      labShareBp: null,
      financeShareBp: null,
      therapyHourlyPence: null,
    });
    expect(dentistRatesUpdatedEvent("d-1", snap, snap)).toBeNull();
  });

  it("adjustment touch creates pay.payslip.adjustments_updated", () => {
    const events = payslipEditAuditEvents(
      "ps-1",
      {
        udas: 10,
        therapyMinutes: 30,
        manualAdjustmentsPence: 0,
        adjustmentsJson: null,
      },
      {
        udas: 10,
        therapyMinutes: 30,
        manualAdjustmentsPence: 500,
        adjustmentsJson: [{ amountPence: 500, description: "bonus", createdBy: "u1", createdAt: "2026-09-01" }],
      },
      { adjustments: true }
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("pay.payslip.adjustments_updated");
    expect(events[0]!.metadata.after).toMatchObject({ manualAdjustmentsPence: 500 });
  });

  it("therapy minutes and UDAs each create audit events when touched", () => {
    const events = payslipEditAuditEvents(
      "ps-1",
      { udas: 10, therapyMinutes: 30, manualAdjustmentsPence: null, adjustmentsJson: null },
      { udas: 12, therapyMinutes: 45, manualAdjustmentsPence: null, adjustmentsJson: null },
      { udas: true, therapyMinutes: true }
    );
    expect(events.map((e) => e.action)).toEqual([
      "pay.payslip.udas_updated",
      "pay.payslip.therapy_minutes_updated",
    ]);
  });

  it("finance term/fee change creates pay.private_line.finance_updated", () => {
    const event = financeLineUpdatedEvent(
      "line-1",
      {
        financeTermMonths: null,
        financeFeePence: null,
        financeFeeManual: false,
        isFinance: true,
      },
      {
        financeTermMonths: 12,
        financeFeePence: 4500,
        financeFeeManual: true,
        isFinance: true,
      },
      "confirmed with patient"
    );
    expect(event?.action).toBe("pay.private_line.finance_updated");
    expect(event?.metadata.before).toMatchObject({ financeTermMonths: null });
    expect(event?.metadata.after).toMatchObject({ financeTermMonths: 12, financeFeePence: 4500 });
    expect(event?.metadata.reason).toBe("confirmed with patient");
  });
});
