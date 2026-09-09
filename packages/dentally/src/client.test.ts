import { describe, expect, it, vi } from "vitest";
import {
  APP_USER_AGENT,
  buildDentallyHeaders,
  DentallyApiError,
  DentallyClient,
  requireDentallySiteId,
} from "./client";
import { resolveInvoicePractitionerUserId } from "./invoice-attribution";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("Dentally client contract headers (Step 2)", () => {
  it("buildDentallyHeaders sets Authorization, User-Agent, Accept, Content-Type", () => {
    const headers = buildDentallyHeaders("secret-key");
    expect(headers.Authorization).toBe("Bearer secret-key");
    expect(headers["User-Agent"]).toBe(APP_USER_AGENT);
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(APP_USER_AGENT).toMatch(/^ELIO\//);
  });

  it("every GET sends the full header contract", async () => {
    let captured: HeadersInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = init?.headers;
      return jsonResponse({ patients: [], meta: { total: 0, page: 1 } });
    });
    const client = new DentallyClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.get("/patients");
    const headers = captured as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k");
    expect(headers["User-Agent"]).toBe(APP_USER_AGENT);
    expect(headers.Accept).toBe("application/json");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("requireDentallySiteId", () => {
  it("passes when site_id is present", () => {
    expect(() => requireDentallySiteId({ site_id: "42", page: 1 })).not.toThrow();
  });

  it("throws when site_id is missing or blank", () => {
    expect(() => requireDentallySiteId({ page: 1 })).toThrow(/site_id/);
    expect(() => requireDentallySiteId({ site_id: "" })).toThrow(/site_id/);
    expect(() => requireDentallySiteId({ site_id: "   " })).toThrow(/site_id/);
  });
});

describe("resolveInvoicePractitionerUserId", () => {
  it("prefers invoice line practitioner_id (Dentally user.id)", () => {
    expect(
      resolveInvoicePractitionerUserId({
        id: 1,
        user_id: 99,
        practitioner_id: 88,
        invoice_items: [{ practitioner_id: 777 }],
      })
    ).toBe("777");
  });

  it("falls back to user_id then practitioner_id", () => {
    expect(resolveInvoicePractitionerUserId({ id: 1, user_id: 99, practitioner_id: 88 })).toBe("99");
    expect(resolveInvoicePractitionerUserId({ id: 1, practitioner_id: 88 })).toBe("88");
    expect(resolveInvoicePractitionerUserId({ id: 1 })).toBe("");
  });
});

describe("DentallyClient rate-limit backoff", () => {
  it("retries a 429 with backoff and succeeds once the API recovers", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls <= 2) {
        return jsonResponse({ error: "rate limited" }, 429, { "retry-after": "0" });
      }
      return jsonResponse({ patients: [{ id: 1 }], meta: { total: 1, page: 1 } });
    });
    const sleeps: number[] = [];
    const client = new DentallyClient({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });

    const result = await client.get<{ patients: unknown[] }>("/patients");

    expect(calls).toBe(3);
    expect(result.patients).toHaveLength(1);
    expect(sleeps).toHaveLength(2);
  });

  it("retries a rate-limit 403 with backoff (PDF §2)", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls <= 2) {
        return jsonResponse({ error: "rate limited" }, 403, { "retry-after": "0" });
      }
      return jsonResponse({ patients: [{ id: 1 }], meta: { total: 1, page: 1 } });
    });
    const client = new DentallyClient({
      apiKey: "test-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    const result = await client.get<{ patients: unknown[] }>("/patients");
    expect(calls).toBe(3);
    expect(result.patients).toHaveLength(1);
  });

  it("throws DentallyApiError after exhausting retries on persistent 429s", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const client = new DentallyClient({
      apiKey: "test-key",
      maxRetries: 2,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await expect(client.get("/patients")).rejects.toBeInstanceOf(DentallyApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-transient error (e.g. 401)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "unauthorized" }, 401));
    const client = new DentallyClient({
      apiKey: "bad-key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await expect(client.get("/patients")).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("DentallyClient.paginate", () => {
  it("walks every page using the total_pages meta shape", async () => {
    const pages = [
      jsonResponse({ appointments: [{ id: 1 }, { id: 2 }], meta: { total: 3, current_page: 1, total_pages: 2 } }),
      jsonResponse({ appointments: [{ id: 3 }], meta: { total: 3, current_page: 2, total_pages: 2 } }),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => pages[call++]);
    const client = new DentallyClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });

    const seen: unknown[] = [];
    const total = await client.paginate("/appointments", "appointments", {}, (items) => {
      seen.push(...(items as unknown[]));
    });

    expect(total).toBe(3);
    expect(seen).toHaveLength(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stops on a short page using the {total, page} meta shape (no total_pages)", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ patients: [{ id: 1 }], meta: { total: 1, page: 1 } })
    );
    const client = new DentallyClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });

    const total = await client.paginate("/patients", "patients", {}, () => {}, { perPage: 100 });

    expect(total).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("continues when {total, page} says more pages remain (no total_pages)", async () => {
    // Regression: with per_page=500 the API still returned ≤100 items, short-page
    // detection stopped after page 1, and most of the practice never synced.
    const pages = [
      jsonResponse({
        patients: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
        meta: { total: 250, page: 1 },
      }),
      jsonResponse({
        patients: Array.from({ length: 100 }, (_, i) => ({ id: i + 101 })),
        meta: { total: 250, page: 2 },
      }),
      jsonResponse({
        patients: Array.from({ length: 50 }, (_, i) => ({ id: i + 201 })),
        meta: { total: 250, page: 3 },
      }),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => pages[call++]);
    const client = new DentallyClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });

    const total = await client.paginate("/patients", "patients", {}, () => {}, { perPage: 100 });

    expect(total).toBe(250);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not treat a full capped page as done when total is unknown", async () => {
    const pages = [
      jsonResponse({ patients: Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })), meta: {} }),
      jsonResponse({ patients: Array.from({ length: 20 }, (_, i) => ({ id: i + 101 })), meta: {} }),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => pages[call++]);
    const client = new DentallyClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });

    const total = await client.paginate("/patients", "patients", {}, () => {}, { perPage: 100 });

    expect(total).toBe(120);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("partial-failure isolation", () => {
  it("one bad page callback does not stop remaining pages from being fetched", async () => {
    const pages = [
      jsonResponse({ patients: [{ id: 1 }, { id: 2 }], meta: { total: 3, page: 1 } }),
      jsonResponse({ patients: [{ id: 3 }], meta: { total: 3, page: 2 } }),
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => pages[call++]);
    const client = new DentallyClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });

    const results: Array<{ id: number; ok: boolean; error?: string }> = [];
    await client.paginate<{ id: number }>(
      "/patients",
      "patients",
      {},
      async (items) => {
        for (const item of items) {
          try {
            if (item.id === 2) throw new Error("simulated upsert failure for record 2");
            results.push({ id: item.id, ok: true });
          } catch (err) {
            results.push({ id: item.id, ok: false, error: (err as Error).message });
          }
        }
      },
      { perPage: 2 }
    );

    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.find((r) => r.id === 2)?.ok).toBe(false);
  });
});
