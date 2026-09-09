import { describe, expect, it } from "vitest";
import {
  dentallyLineSourceFields,
  formatLineSourceSummary,
  isTraceablePrivateLine,
  manualLineSourceFields,
} from "./line-source";

describe("line source / Step 32 traceability", () => {
  it("stamps Dentally invoice id + amount line key", () => {
    expect(dentallyLineSourceFields({ dentallyInvoiceId: "inv-9", amountPence: 15000 })).toEqual({
      dentallyInvoiceId: "inv-9",
      dentallyLineKey: "amt:15000",
      sourceType: "DENTALLY",
    });
  });

  it("prefers Dentally item id for stable line keys (no duplicate amount collisions)", () => {
    expect(
      dentallyLineSourceFields({
        dentallyInvoiceId: "inv-9",
        amountPence: 15000,
        dentallyItemId: "item-42",
      })
    ).toEqual({
      dentallyInvoiceId: "inv-9",
      dentallyLineKey: "di:item-42",
      sourceType: "DENTALLY",
    });
  });

  it("uses amount occurrence suffix when item id is absent", () => {
    expect(
      dentallyLineSourceFields({
        dentallyInvoiceId: "inv-9",
        amountPence: 15000,
        amountOccurrence: 2,
      })
    ).toEqual({
      dentallyInvoiceId: "inv-9",
      dentallyLineKey: "amt:15000#2",
      sourceType: "DENTALLY",
    });
  });

  it("manual lines require note and author", () => {
    expect(() =>
      manualLineSourceFields({ amountPence: 100, actorUserId: "u1", note: "" })
    ).toThrow(/note/i);
    expect(
      manualLineSourceFields({ amountPence: 10000, actorUserId: "u1", note: "Missed from Dentally" })
    ).toEqual({
      dentallyLineKey: "amt:10000",
      sourceType: "MANUAL",
      manualCreatedByUserId: "u1",
      manualNote: "Missed from Dentally",
    });
  });

  it("formats source summary and detects unexplained plugs", () => {
    expect(
      formatLineSourceSummary({
        dentallyInvoiceId: "inv-1",
        dentallyLineKey: "amt:5000",
        sourceType: "DENTALLY",
        manualCreatedByUserId: null,
        manualNote: null,
        createdAt: null,
      })
    ).toContain("Dentally · invoice inv-1");

    expect(
      isTraceablePrivateLine({
        dentallyInvoiceId: null,
        dentallyLineKey: null,
        sourceType: "DENTALLY",
        manualCreatedByUserId: null,
        manualNote: null,
        createdAt: null,
      })
    ).toBe(false);

    expect(
      isTraceablePrivateLine({
        dentallyInvoiceId: null,
        dentallyLineKey: "amt:1",
        sourceType: "MANUAL",
        manualCreatedByUserId: "u1",
        manualNote: "adjustment",
        createdAt: new Date("2026-09-01"),
      })
    ).toBe(true);
  });
});
