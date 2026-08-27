import { describe, expect, it, vi } from "vitest";
import { DentallyApiError, DentallyClient } from "./client";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

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
    // Backed off twice before the 3rd (successful) attempt.
    expect(sleeps).toHaveLength(2);
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
    // 1 initial + 2 retries = 3 attempts total.
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

    // 3 records processed total; record 2 failed but 1 and 3 still succeeded —
    // a single bad record doesn't corrupt/abort the rest of the batch.
    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.find((r) => r.id === 2)?.ok).toBe(false);
  });
});
