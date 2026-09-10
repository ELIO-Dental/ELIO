import { beforeEach, describe, expect, it, vi } from "vitest";
import { DentallyClient } from "./client";
import { fetchDentallyPatientWithClient, searchDentallyPatientsWithClient } from "./plans-patient-search-client";

describe("plans patient search", () => {
  let client: DentallyClient;

  beforeEach(() => {
    client = new DentallyClient({
      apiKey: "test-key",
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/patients/99")) {
          return new Response(
            JSON.stringify({
              patient: {
                id: 99,
                first_name: "Direct",
                last_name: "Lookup",
                email_address: "direct@example.com",
              },
            }),
            { status: 200 },
          );
        }
        if (url.includes("query=smith")) {
          return new Response(
            JSON.stringify({
              patients: [{ id: 1, first_name: "John", last_name: "Smith", email_address: "john@example.com" }],
              meta: { total_pages: 1 },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ patients: [] }), { status: 200 });
      }),
    });
  });

  it("searches patients by query", async () => {
    const patients = await searchDentallyPatientsWithClient(client, "smith");
    expect(patients).toHaveLength(1);
    expect(patients[0]?.lastName).toBe("Smith");
  });

  it("fetches a patient by numeric id", async () => {
    const patient = await fetchDentallyPatientWithClient(client, "99");
    expect(patient?.email).toBe("direct@example.com");
  });

  it("returns null for a genuine 404 (patient not found), but rethrows everything else instead of masking real failures as \"not found\"", async () => {
    const notFoundClient = new DentallyClient({
      apiKey: "test-key",
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 })),
    });
    await expect(fetchDentallyPatientWithClient(notFoundClient, "404")).resolves.toBeNull();

    const outageClient = new DentallyClient({
      apiKey: "test-key",
      maxRetries: 1,
      sleepImpl: async () => undefined,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    });
    // Previously this resolved to null — indistinguishable from "patient not found,"
    // which misled callers like the plan-reassign loop into reporting "no payment
    // plan in Dentally" for a patient whose plan a real outage prevented checking.
    await expect(fetchDentallyPatientWithClient(outageClient, "500")).rejects.toThrow();
  });
});
