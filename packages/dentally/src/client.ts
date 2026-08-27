// The ONE Dentally HTTP client (FR-9). Nothing outside this file may issue a raw
// `fetch()` to api.dentally.co — every other module (packages/dentally's own
// sync.ts included) goes through `DentallyClient`.
//
// Merges the best parts of the 3 prior implementations:
// - ElioPlans/src/lib/dentally.ts: required `User-Agent` header (403 without it),
//   response-envelope unwrapping (`{ patients: [...] }` vs bare array), snake_case
//   field mapping discipline.
// - ElioFlow/lib/dentally.ts: minimal typed per-resource helper shape, small user
//   lookup cache pattern (kept here as a general in-flight de-dupe idea, not copied
//   verbatim).
// - ElioPay aurapay's src/app/api/dentally/route.ts: real-world pagination
//   robustness (loop until `total_pages`/short-page, cap max pages) and the lesson
//   that Dentally's date filters are a loose upper bound, not authoritative — callers
//   filter again client-side if exact-period correctness matters (that logic belongs
//   in ElioPay's own sync consumer, Step 1.6, not here).
//
// NEW in this consolidation (none of the 3 originals had it — FR-9 requires it):
// exponential-backoff-on-429 retry + a single-flight request queue so a full sync
// never bursts past Dentally's rate limit.

const DENTALLY_BASE_URL = "https://api.dentally.co/v1";
const APP_USER_AGENT = "ELIO/1.0 (+https://elioportal.co.uk)";

export class DentallyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = "DentallyApiError";
  }
}

export interface DentallyClientOptions {
  /** Defaults to process.env.DENTALLY_API_KEY. Never hardcode a key. */
  apiKey?: string;
  baseUrl?: string;
  /** Max concurrent in-flight requests against Dentally. Default 4. */
  concurrency?: number;
  /** Max retry attempts on 429/5xx before giving up. Default 5. */
  maxRetries?: number;
  /** Base delay (ms) for exponential backoff. Default 500. */
  baseDelayMs?: number;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests, to avoid real sleeping. */
  sleepImpl?: (ms: number) => Promise<void>;
}

type QueueTask<T> = () => Promise<T>;

/**
 * A tiny concurrency-limited queue — caps how many requests are in flight at
 * once so a full-practice sync (thousands of records) can't burst past
 * Dentally's rate limit just because our own code is fast.
 */
class RequestQueue {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(task: QueueTask<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses Dentally's `Retry-After` header (seconds or HTTP-date) if present. */
function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const asSeconds = Number(header);
  if (!Number.isNaN(asSeconds)) return asSeconds * 1000;
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  return null;
}

export class DentallyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly queue: RequestQueue;

  constructor(options: DentallyClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.DENTALLY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "DentallyClient: no API key. Set DENTALLY_API_KEY in the app's env, or pass { apiKey } explicitly."
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? DENTALLY_BASE_URL;
    this.maxRetries = options.maxRetries ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? defaultSleep;
    this.queue = new RequestQueue(options.concurrency ?? 4);
  }

  /**
   * Low-level GET against a Dentally path, with exponential backoff on 429s
   * (and 5xx transient errors), respecting `Retry-After` when Dentally sends one.
   * Every public method funnels through here — this is the ONLY place a raw
   * request is constructed.
   */
  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    return this.queue.run(async () => {
      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await this.fetchImpl(url.toString(), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            // Dentally returns a bare 403 without a User-Agent header — see
            // ElioPlans/src/lib/dentally.ts's comment, confirmed still true.
            "User-Agent": APP_USER_AGENT,
            Accept: "application/json",
          },
        });

        if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
          attempt++;
          if (attempt > this.maxRetries) {
            const body = await res.text().catch(() => "");
            throw new DentallyApiError(
              `Dentally API ${res.status} after ${this.maxRetries} retries: ${path}`,
              res.status,
              body
            );
          }
          const suggested = retryAfterMs(res);
          const backoff = suggested ?? this.baseDelayMs * 2 ** (attempt - 1);
          // Full jitter, capped at 30s, so a burst of parallel workers hitting a
          // 429 at once don't all retry in lockstep.
          const jittered = Math.min(30_000, Math.random() * backoff);
          await this.sleepImpl(jittered);
          continue;
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new DentallyApiError(`Dentally API ${res.status}: ${path}`, res.status, body);
        }

        return (await res.json()) as T;
      }
    });
  }

  /**
   * Generic paginator: walks every page of a Dentally list endpoint, calling
   * `onPage` with each page's items so callers can stream-process without
   * holding the whole practice's history in memory at once.
   *
   * Handles both pagination meta shapes Dentally actually returns (confirmed
   * live 2026-08-17): `{ total, page }` (patients) and
   * `{ total, current_page, total_pages }` (appointments/invoices).
   */
  async paginate<TItem>(
    path: string,
    listKey: string,
    params: Record<string, string | number | undefined>,
    onPage: (items: TItem[]) => Promise<void> | void,
    opts: { perPage?: number; maxPages?: number } = {}
  ): Promise<number> {
    const perPage = opts.perPage ?? 100; // Dentally's documented max per_page.
    const maxPages = opts.maxPages ?? 1000; // safety cap against a runaway loop
    let page = 1;
    let fetched = 0;

    while (page <= maxPages) {
      const data = await this.get<Record<string, unknown>>(path, {
        ...params,
        per_page: perPage,
        page,
      });
      const items = (data[listKey] as TItem[] | undefined) ?? [];
      if (items.length === 0) break;

      await onPage(items);
      fetched += items.length;

      const meta = (data.meta ?? {}) as { total_pages?: number; total?: number };
      const totalPages = meta.total_pages;
      if (totalPages !== undefined) {
        if (page >= totalPages) break;
      } else if (items.length < perPage) {
        break; // short page = last page (meta only reports `total`, e.g. patients)
      }
      page++;
    }

    return fetched;
  }
}

let sharedClient: DentallyClient | null = null;

/** Lazily-constructed singleton using process.env.DENTALLY_API_KEY. */
export function getDentallyClient(): DentallyClient {
  if (!sharedClient) sharedClient = new DentallyClient();
  return sharedClient;
}

/** Test-only: reset the singleton so a fresh client (e.g. with a mock fetch) can be installed. */
export function __resetDentallyClientForTests(): void {
  sharedClient = null;
}
