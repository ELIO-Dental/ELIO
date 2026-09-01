import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./resolve-api-key", () => ({
  getDentallyClientForPractice: vi.fn(),
}));

vi.mock("@elio/db", () => ({
  prisma: {
    patient: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@elio/db";
import { DentallyClient } from "./client";
import { fetchLivePatientPanel } from "./live-patient";

const mockFindFirst = prisma.patient.findFirst as ReturnType<typeof vi.fn>;

describe("fetchLivePatientPanel", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("fetches live appointments, invoices, payments, and account for a patient", async () => {
    mockFindFirst.mockResolvedValue({
      id: "elio-p1",
      dentallyId: "42",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "07000000000",
    });

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/patients/42")) {
        return new Response(
          JSON.stringify({
            patient: {
              id: 42,
              first_name: "Jane",
              last_name: "Doe",
              email_address: "jane@example.com",
              mobile_phone: "07000000000",
            },
          }),
        );
      }
      if (url.includes("/appointments")) {
        return new Response(
          JSON.stringify({
            appointments: [
              {
                id: 1,
                patient_id: 42,
                starts_at: "2026-01-15T10:00:00Z",
                reason: "Cosmetic Consultation",
                state: "Completed",
              },
            ],
            meta: { total: 1, page: 1, total_pages: 1 },
          }),
        );
      }
      if (url.includes("/invoices")) {
        return new Response(
          JSON.stringify({
            invoices: [
              {
                id: 9,
                patient_id: 42,
                amount: "1500.00",
                amount_outstanding: "500.00",
                dated_on: "2026-01-20",
                paid: false,
                state: "open",
              },
            ],
            meta: { total: 1, page: 1, total_pages: 1 },
          }),
        );
      }
      if (url.includes("/payments")) {
        return new Response(
          JSON.stringify({
            payments: [{ id: 3, patient_id: 42, amount: "50.00", dated_on: "2026-01-16" }],
            meta: { total: 1, page: 1, total_pages: 1 },
          }),
        );
      }
      if (url.includes("/accounts")) {
        return new Response(
          JSON.stringify({
            accounts: [
              {
                id: 7,
                patient_id: 42,
                current_balance: "500.00",
                planned_private_treatment_value: "6000.00",
              },
            ],
            meta: { total: 1, page: 1, total_pages: 1 },
          }),
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    const client = new DentallyClient({ apiKey: "test", fetchImpl: fetchImpl as unknown as typeof fetch });
    const panel = await fetchLivePatientPanel("practice-1", "elio-p1", client);

    expect(panel.patient.name).toBe("Jane Doe");
    expect(panel.appointments).toHaveLength(1);
    expect(panel.appointments[0]?.reason).toBe("Cosmetic Consultation");
    expect(panel.invoices[0]?.amountPence).toBe(150_000);
    expect(panel.payments[0]?.amountPence).toBe(5_000);
    expect(panel.account?.plannedPrivateTreatmentValuePence).toBe(600_000);
  });

  it("throws when patient is not found in ELIO", async () => {
    mockFindFirst.mockResolvedValue(null);
    const client = new DentallyClient({ apiKey: "test", fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(fetchLivePatientPanel("practice-1", "missing", client)).rejects.toThrow("Patient not found");
  });
});
