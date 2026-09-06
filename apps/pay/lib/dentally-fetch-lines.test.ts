import { describe, expect, it, vi } from "vitest";
import type { DentallyInvoiceRaw } from "@elio/dentally";
import { hydrateInvoiceItems, privateLinesByPractitioner } from "./dentally-fetch-lines";

describe("privateLinesByPractitioner (Step 6)", () => {
  it("splits dual-clinician invoice across practitioner user ids", () => {
    const inv: DentallyInvoiceRaw = {
      id: 1,
      amount: 500,
      invoice_items: [
        { name: "Crown", amount: 300, practitioner_id: 111 },
        { name: "Fill", amount: 200, practitioner_id: 222 },
      ],
    };
    const { lines } = privateLinesByPractitioner(inv, new Set());
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.practitionerUserId).sort()).toEqual(["111", "222"]);
    expect(lines.find((l) => l.practitionerUserId === "111")?.amount).toBe(300);
  });

  it("skips NHS / CBCT / therapist lines", () => {
    const inv: DentallyInvoiceRaw = {
      id: 2,
      amount: 400,
      invoice_items: [
        { name: "Band 1", amount: 27.4, practitioner_id: 111 },
        { name: "CBCT scan", amount: 100, practitioner_id: 111 },
        { name: "Hygiene", amount: 50, practitioner_id: 999 },
        { name: "Composite", amount: 80, practitioner_id: 111 },
      ],
    };
    const { lines, skippedNhs, skippedTherapist } = privateLinesByPractitioner(
      inv,
      new Set([27.4]),
      new Set(["999"])
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.name).toBe("Composite");
    expect(skippedNhs).toBeGreaterThanOrEqual(2);
    expect(skippedTherapist).toBe(1);
  });

  it("uses total_price when present", () => {
    const inv: DentallyInvoiceRaw = {
      id: 3,
      invoice_items: [{ name: "X", total_price: "150.00", practitioner_id: 5 }],
    };
    const { lines } = privateLinesByPractitioner(inv, new Set());
    expect(lines[0]?.amount).toBe(150);
  });
});

describe("hydrateInvoiceItems", () => {
  it("skips GET when items already present", async () => {
    const get = vi.fn();
    const client = { get } as never;
    const inv: DentallyInvoiceRaw = {
      id: 9,
      invoice_items: [{ name: "A", amount: 10, practitioner_id: 1 }],
    };
    const out = await hydrateInvoiceItems(client, inv);
    expect(out).toBe(inv);
    expect(get).not.toHaveBeenCalled();
  });

  it("GETs /invoices/{id} when items missing", async () => {
    const get = vi.fn(async () => ({
      invoice: {
        id: 9,
        invoice_items: [{ name: "Hydrated", amount: 40, practitioner_id: 7 }],
      },
    }));
    const client = { get } as never;
    const out = await hydrateInvoiceItems(client, { id: 9 });
    expect(get).toHaveBeenCalledWith("/invoices/9");
    expect(out.invoice_items?.[0]?.name).toBe("Hydrated");
  });
});
