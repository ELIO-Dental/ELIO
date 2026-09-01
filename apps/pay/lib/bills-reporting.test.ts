import { describe, expect, it } from "vitest";
import {
  aggregateLabByMonth,
  buildBillsReportingPayload,
  buildDentistPayTable,
  computeDentistPayGrandTotals,
  detectLabAnomalies,
  summarizeBills,
} from "./bills-reporting";

describe("bills-reporting", () => {
  const labBills = [
    {
      labName: "Acme Lab",
      amountPence: 10000,
      paid: true,
      billDate: new Date("2026-03-15"),
      createdAt: new Date("2026-03-16"),
      dentistName: "Dr A",
    },
    {
      labName: "Acme Lab",
      amountPence: 50000,
      paid: false,
      billDate: new Date("2026-04-10"),
      createdAt: new Date("2026-04-11"),
      dentistName: "Dr A",
    },
  ];

  it("summarizes paid and unpaid totals", () => {
    expect(summarizeBills(labBills)).toEqual({
      totalCount: 2,
      totalPence: 60000,
      paidCount: 1,
      paidPence: 10000,
      unpaidCount: 1,
      unpaidPence: 50000,
    });
  });

  it("aggregates lab bills by month and lab", () => {
    const rows = aggregateLabByMonth(labBills);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.month === 3)?.totalPence).toBe(10000);
    expect(rows.find((r) => r.month === 4)?.unpaidPence).toBe(50000);
  });

  it("detects lab spend anomalies", () => {
    const labByMonth = [
      { year: 2026, month: 1, entityName: "Lab A", totalPence: 10000, count: 1, paidCount: 1, paidPence: 10000, unpaidPence: 0 },
      { year: 2026, month: 2, entityName: "Lab A", totalPence: 10000, count: 1, paidCount: 1, paidPence: 10000, unpaidPence: 0 },
      { year: 2026, month: 3, entityName: "Lab A", totalPence: 10000, count: 1, paidCount: 1, paidPence: 10000, unpaidPence: 0 },
      { year: 2026, month: 4, entityName: "Lab A", totalPence: 10000, count: 1, paidCount: 1, paidPence: 10000, unpaidPence: 0 },
      { year: 2026, month: 5, entityName: "Lab A", totalPence: 500000, count: 1, paidCount: 1, paidPence: 500000, unpaidPence: 0 },
    ];
    const { anomalies } = detectLabAnomalies(labByMonth);
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies[0]?.isHigh).toBe(true);
  });

  it("returns no anomalies when spend is stable", () => {
    const labByMonth = [
      { year: 2026, month: 1, entityName: "Lab A", totalPence: 10000, count: 1, paidCount: 1, paidPence: 10000, unpaidPence: 0 },
      { year: 2026, month: 2, entityName: "Lab A", totalPence: 10500, count: 1, paidCount: 1, paidPence: 10500, unpaidPence: 0 },
    ];
    expect(detectLabAnomalies(labByMonth).anomalies).toHaveLength(0);
  });

  it("builds dentist pay table with draft flag", () => {
    const { rows } = buildDentistPayTable([
      {
        year: 2026,
        month: 3,
        periodStatus: "DRAFT",
        dentistName: "Dr A",
        finalPayPence: 250000,
      },
      {
        year: 2026,
        month: 4,
        periodStatus: "LOCKED",
        dentistName: "Dr A",
        finalPayPence: 300000,
      },
    ]);
    expect(rows[0]?.isDraft).toBe(true);
    expect(rows[1]?.isDraft).toBe(false);
    expect(rows[1]?.totalPence).toBe(300000);
  });

  it("computes dentist pay grand totals", () => {
    const { rows } = buildDentistPayTable([
      { year: 2026, month: 3, periodStatus: "LOCKED", dentistName: "Dr A", finalPayPence: 100000 },
      { year: 2026, month: 4, periodStatus: "LOCKED", dentistName: "Dr A", finalPayPence: 150000 },
      { year: 2026, month: 3, periodStatus: "LOCKED", dentistName: "Dr B", finalPayPence: 80000 },
    ]);
    const totals = computeDentistPayGrandTotals(rows, ["Dr A", "Dr B"]);
    expect(totals.byDentistPence["Dr A"]).toBe(250000);
    expect(totals.byDentistPence["Dr B"]).toBe(80000);
    expect(totals.totalPence).toBe(330000);
  });

  it("builds full reporting payload", () => {
    const payload = buildBillsReportingPayload({
      labBills,
      supplierInvoices: [
        {
          supplierName: "Dental Supplies",
          amountPence: 8000,
          paid: false,
          invoiceDate: new Date("2026-03-20"),
          createdAt: new Date("2026-03-21"),
        },
      ],
      periods: [
        {
          periodStart: new Date("2026-03-01"),
          status: "LOCKED",
          payslipEntries: [{ dentistName: "Dr A", finalPayPence: 100000 }],
        },
      ],
    });
    expect(payload.labSummary.totalPence).toBe(60000);
    expect(payload.supplierSummary.unpaidPence).toBe(8000);
    expect(payload.dentistPayTable).toHaveLength(1);
    expect(payload.dentistNames).toEqual(["Dr A"]);
    expect(payload.dentistPayGrandTotals.totalPence).toBe(100000);
  });
});
