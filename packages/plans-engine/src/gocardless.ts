/**
 * GoCardless integration, ported from ElioPlans' `src/lib/gocardless.ts`.
 *
 * The client wrapper functions (createCustomer, createSubscription, etc.) call
 * out to the live GoCardless SDK/API and read process.env directly — they are
 * kept here, re-housed rather than rewritten, exactly per the migration brief
 * ("preserve the GoCardless integration... as-is functionally, just re-housed
 * in the new structure"). apps/plans imports this module rather than talking to
 * the `gocardless-nodejs` SDK directly.
 *
 * The pure, DB/network-free decision logic (isLiveSubscriptionStatus,
 * findReusableSubscription, verifyWebhookSignature, mapMandateStatus,
 * mapPaymentStatus) is what the BUG regression tests exercise directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _cachedClient: any = null;

/**
 * TEST-ONLY mock client, active only when GOCARDLESS_MOCK_MODE="true" (set by
 * the e2e Playwright config, never in a real dev/prod env). Exists so the e2e
 * suite exercises the REAL route/service code paths (createMandateFlow,
 * recordMandate, runReconciliation, etc.) without ever calling the live
 * GoCardless account configured in apps/plans/.env.local
 * (GOCARDLESS_ENVIRONMENT="live" — a real account, not sandbox). An in-memory
 * store keeps billing requests / mandates / payments consistent across calls
 * within one server process, so a payment created via the mock "GoCardless"
 * for a mandate is later returned by listPaymentsByChargeDate for
 * reconciliation to match against.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _mockStore = {
  billingRequests: new Map<string, any>(),
  mandates: new Map<string, any>(),
  payments: new Map<string, any>(),
  subscriptions: new Map<string, any>(),
  customers: new Map<string, any>(),
};
let _mockSeq = 0;
const nextId = (prefix: string) => `${prefix}_MOCK_${(_mockSeq++).toString().padStart(6, "0")}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockClient(): any {
  return {
    customers: {
      create: async (input: Record<string, unknown>) => {
        const id = nextId("CU");
        const record = { id, ...input };
        _mockStore.customers.set(id, record);
        return record;
      },
      find: async (id: string) => _mockStore.customers.get(id),
      all: async function* () {
        for (const c of _mockStore.customers.values()) yield c;
      },
    },
    billingRequests: {
      create: async (input: Record<string, unknown>) => {
        const id = nextId("BRQ");
        // In the real flow the mandate is only resolvable once the patient has
        // actually authorised it in GoCardless's hosted UI. The e2e suite
        // simulates "the patient completed authorisation and GoCardless
        // redirected back" by treating every mock billing request as
        // immediately authorised, with its own mandate id pre-linked —
        // deterministic, since there is no real hosted UI to drive here.
        const mandateId = nextId("MD");
        _mockStore.mandates.set(mandateId, { id: mandateId, status: "active" });
        const record = {
          id,
          status: "fulfilled",
          ...input,
          links: { customer: nextId("CU"), mandate_request_mandate: mandateId },
        };
        _mockStore.billingRequests.set(id, record);
        return record;
      },
      // Real gocardless-nodejs's BillingRequestService exposes `.find(identity)`,
      // NOT `.get(id)` — confirmed against the real SDK's type definitions
      // (node_modules/gocardless-nodejs/services/billingRequestService.d.ts)
      // after a real sandbox test caught this exact mismatch: the mock used
      // to only define `.get()`, which matched what getBillingRequest() below
      // called, so this bug was invisible under GOCARDLESS_MOCK_MODE and only
      // surfaced against the real API.
      find: async (id: string) => {
        const br = _mockStore.billingRequests.get(id);
        if (!br) throw new Error(`[GoCardless mock] billing request ${id} not found`);
        return br;
      },
    },
    billingRequestFlows: {
      create: async (input: { links: { billing_request: string } }) => {
        const id = nextId("BRF");
        return {
          id,
          authorisation_url: `https://mock.gocardless.test/flow/${id}`,
          links: input.links,
        };
      },
    },
    mandates: {
      find: async (id: string) => _mockStore.mandates.get(id) ?? { id, status: "active" },
      cancel: async (id: string) => ({ id, status: "cancelled" }),
    },
    payments: {
      create: async (input: Record<string, unknown>) => {
        const id = nextId("PM");
        const record = { id, status: "confirmed", ...input };
        _mockStore.payments.set(id, record);
        return record;
      },
      find: async (id: string) => _mockStore.payments.get(id),
      all: async function* (filters: Record<string, string>) {
        const from = filters["charge_date[gte]"];
        const to = filters["charge_date[lte]"];
        for (const p of _mockStore.payments.values()) {
          const chargeDate = p.charge_date as string | undefined;
          if (!chargeDate) continue;
          if (from && chargeDate < from) continue;
          if (to && chargeDate > to) continue;
          yield p;
        }
      },
    },
    subscriptions: {
      list: async (filters: { mandate: string }) => ({
        subscriptions: [...(_mockStore.subscriptions.values() as Iterable<{ links?: { mandate?: string } }>)].filter(
          (s) => s.links?.mandate === filters.mandate
        ),
      }),
      create: async (input: Record<string, unknown>) => {
        const id = nextId("SB");
        const record = { id, status: "active", ...input };
        _mockStore.subscriptions.set(id, record);
        return record;
      },
      update: async (id: string, input: Record<string, unknown>) => ({ id, ...input }),
      cancel: async (id: string) => ({ id, status: "cancelled" }),
    },
  };
}

/** Test-only helper (used by the e2e suite) so a test can register a mandate
 * as "active" in the mock store and seed a matching payment, keeping
 * reconciliation self-consistent without a real GoCardless account. */
export function __mockGoCardlessRegisterMandate(id: string, status: string) {
  _mockStore.mandates.set(id, { id, status });
}
export function __mockGoCardlessSeedPayment(input: {
  id: string;
  amount: number;
  status: string;
  chargeDate: string;
  mandateId: string;
}) {
  _mockStore.payments.set(input.id, {
    id: input.id,
    amount: input.amount,
    status: input.status,
    charge_date: input.chargeDate,
    links: { mandate: input.mandateId },
  });
}
export function __mockGoCardlessReset() {
  _mockStore.billingRequests.clear();
  _mockStore.mandates.clear();
  _mockStore.payments.clear();
  _mockStore.subscriptions.clear();
  _mockStore.customers.clear();
}

/** Initialize the GoCardless client on demand (lazy, cached per cold start). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getGoCardlessClient(): any {
  if (process.env.GOCARDLESS_MOCK_MODE === "true") {
    if (!_cachedClient) _cachedClient = createMockClient();
    return _cachedClient;
  }

  if (_cachedClient) return _cachedClient;

  const environment = process.env.GOCARDLESS_ENVIRONMENT || "sandbox";
  const accessToken = process.env.GOCARDLESS_ACCESS_TOKEN;

  if (!accessToken) {
    console.warn("[GoCardless] GOCARDLESS_ACCESS_TOKEN is not set");
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const GoCardlessModule = require("gocardless-nodejs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Environments } = require("gocardless-nodejs/constants");

  console.log(
    `[GoCardless] Initializing client: env=${environment}, token=${accessToken.substring(0, 8)}...`
  );

  const GoCardless = GoCardlessModule.default || GoCardlessModule;
  _cachedClient = new GoCardless(
    accessToken,
    environment === "live" ? Environments.Live : Environments.Sandbox,
    { raiseOnIdempotencyConflict: true }
  );

  return _cachedClient;
}

export interface CreateCustomerInput {
  email: string;
  givenName: string;
  familyName: string;
  addressLine1?: string;
  city?: string;
  postalCode?: string;
  countryCode?: string;
  metadata?: Record<string, string>;
}

export interface CreateBillingRequestInput {
  customerId?: string;
  mandateRequest: {
    scheme: string;
    currency: string;
    metadata?: Record<string, string>;
  };
  paymentRequest?: {
    amount: number;
    currency: string;
    description: string;
  };
  metadata?: Record<string, string>;
}

function requireClient() {
  const client = getGoCardlessClient();
  if (!client) {
    throw new Error(
      "GoCardless client not initialized. Check GOCARDLESS_ACCESS_TOKEN is set in environment variables."
    );
  }
  return client;
}

export async function createCustomer(input: CreateCustomerInput) {
  const client = requireClient();
  return client.customers.create({
    email: input.email,
    given_name: input.givenName,
    family_name: input.familyName,
    address_line1: input.addressLine1,
    city: input.city,
    postal_code: input.postalCode,
    country_code: input.countryCode || "GB",
    metadata: input.metadata,
  });
}

export async function createBillingRequest(input: CreateBillingRequestInput) {
  const client = requireClient();
  return client.billingRequests.create({
    mandate_request: {
      scheme: input.mandateRequest.scheme,
      currency: input.mandateRequest.currency,
      metadata: input.mandateRequest.metadata,
    },
    payment_request: input.paymentRequest
      ? {
          amount: input.paymentRequest.amount,
          currency: input.paymentRequest.currency,
          description: input.paymentRequest.description,
        }
      : undefined,
    metadata: input.metadata,
    links: input.customerId ? { customer: input.customerId } : undefined,
  });
}

export async function createBillingRequestFlow(
  billingRequestId: string,
  redirectUri: string,
  exitUri: string
) {
  const client = requireClient();
  return client.billingRequestFlows.create({
    redirect_uri: redirectUri,
    exit_uri: exitUri,
    links: { billing_request: billingRequestId },
    lock_currency: true,
    lock_customer_details: false,
    show_redirect_buttons: true,
  });
}

/**
 * A subscription counts as "live" if it is billing now or will resume billing.
 * Creating another alongside one of these double-charges the patient.
 * Exported (and pure) so the duplicate-guard rule is directly unit-testable.
 */
export function isLiveSubscriptionStatus(status?: string): boolean {
  return status === "active" || status === "pending_customer_approval" || status === "paused";
}

/** Pick the existing live subscription to reuse, or null if a new one is needed. */
export function findReusableSubscription<T extends { id?: string; status?: string }>(
  existing: T[]
): T | null {
  return existing.find((s) => isLiveSubscriptionStatus(s.status)) ?? null;
}

/**
 * List every subscription GoCardless holds against a mandate.
 * Used to prevent creating a second one (which would double-charge the patient).
 */
export async function listSubscriptionsForMandate(mandateId: string) {
  const client = requireClient();
  const response = await client.subscriptions.list({ mandate: mandateId, limit: 500 });
  return response?.subscriptions ?? [];
}

/**
 * Create a monthly subscription against a mandate.
 *
 * IDEMPOTENCY (BUG: double charging). Multiple call sites (signup, in-person DD
 * setup, the mandates.active webhook, the gc-sync cron, link-mandate, and
 * bulk-check-gc paths) can each try to create a subscription for the same
 * patient (e.g. signup creates one, then the webhook arrives and creates
 * another), leaving TWO active subscriptions on one mandate and charging the
 * patient twice every month, forever, with nothing detecting it.
 *
 * The guard lives here rather than at each call site so that no existing or
 * future caller can bypass it: if the mandate already has a live subscription we
 * return that one instead of creating a second. GoCardless is the source of
 * truth, not our local `gocardlessSubscriptionId`, because the duplicates arose
 * precisely when our local record was missing or stale.
 *
 * Pass `force: true` only for a deliberate second subscription on one mandate
 * (e.g. a genuinely separate add-on product).
 */
export async function createSubscription(
  mandateId: string,
  amount: number,
  currency: string,
  name: string,
  dayOfMonth: number = 1,
  metadata?: Record<string, string>,
  options?: { force?: boolean }
) {
  const client = requireClient();

  if (!options?.force) {
    const existing = await listSubscriptionsForMandate(mandateId);
    const reusable = findReusableSubscription(existing);

    if (reusable) {
      console.warn(
        `[GoCardless] Mandate ${mandateId} already has a live subscription (${reusable.id}). ` +
          `Reusing it instead of creating a duplicate — this would have double-charged the patient.`
      );
      return reusable;
    }
  }

  return client.subscriptions.create({
    amount: amount.toString(),
    currency,
    name,
    interval_unit: "monthly",
    day_of_month: dayOfMonth.toString(),
    links: { mandate: mandateId },
    metadata,
  });
}

export async function createPayment(
  mandateId: string,
  amount: number,
  currency: string,
  description: string,
  chargeDate?: string,
  metadata?: Record<string, string>
) {
  const client = requireClient();
  return client.payments.create({
    amount: amount.toString(),
    currency,
    description,
    charge_date: chargeDate,
    links: { mandate: mandateId },
    metadata,
  });
}

export async function updateSubscriptionAmount(subscriptionId: string, amountInPence: number) {
  const client = requireClient();
  return client.subscriptions.update(subscriptionId, { amount: amountInPence.toString() });
}

export async function cancelSubscription(subscriptionId: string) {
  const client = requireClient();
  return client.subscriptions.cancel(subscriptionId);
}

export async function cancelMandate(mandateId: string) {
  const client = requireClient();
  return client.mandates.cancel(mandateId);
}

// All four of the following used `.get(id)` — the real gocardless-nodejs
// SDK's services (CustomerService/MandateService/PaymentService/
// BillingRequestService) all actually expose `.find(identity)`, confirmed
// against the SDK's own type definitions after a real GoCardless sandbox
// test caught this exact mismatch live (`client.payments.get is not a
// function`). This was invisible under GOCARDLESS_MOCK_MODE because the
// mock client used to only define `.get()`, matching what this file called
// — see the mock's own `find:` entries for the parallel fix. This was a
// REAL, previously-hidden production risk: `getPayment` is called from
// `createPaymentFromGoCardless()` in the live webhook handler for any
// GoCardless payment event not yet seen locally — this bug would have
// silently broken real payment tracking (BUG-1's core protection) the
// first time a genuinely new payment webhook arrived in production.
export async function getCustomer(customerId: string) {
  const client = requireClient();
  return client.customers.find(customerId);
}

export async function getMandate(mandateId: string) {
  const client = requireClient();
  return client.mandates.find(mandateId);
}

export async function getPayment(paymentId: string) {
  const client = requireClient();
  return client.payments.find(paymentId);
}

export async function getBillingRequest(billingRequestId: string) {
  const client = requireClient();
  return client.billingRequests.find(billingRequestId);
}

export async function listCustomersByEmail(email: string) {
  const client = requireClient();
  // SDK v7 doesn't support an email filter on customers.list() — auto-paginate
  // via the all() async generator and filter client-side.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches: any[] = [];
  for await (const customer of client.customers.all({})) {
    if (customer.email && customer.email.toLowerCase() === email.toLowerCase()) {
      matches.push(customer);
    }
  }
  return matches;
}

export async function listMandatesForCustomer(customerId: string) {
  const client = requireClient();
  const response = await client.mandates.list({ customer: customerId });
  return response?.mandates || [];
}

/**
 * List all payments charged in a date window [chargeFrom, chargeTo] (YYYY-MM-DD).
 * Auto-paginates via the SDK's async iterator. Used by the daily reconciliation
 * job to compare GoCardless's actual payments against ELIO's expected charges.
 */
export async function listPaymentsByChargeDate(chargeFrom: string, chargeTo: string) {
  const client = requireClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payments: any[] = [];

  // GoCardless expects bracket notation for range filters — `charge_date[gte]`,
  // not `charge_date_gte`. The underscore form is not recognised as a date
  // range, so the API used to reject the whole request with 400 "Combination of
  // filters requested is invalid", which surfaced in the UI as a permanent
  // "Failed to fetch GoCardless payments" on the Reconciliation page.
  for await (const payment of client.payments.all({
    "charge_date[gte]": chargeFrom,
    "charge_date[lte]": chargeTo,
  })) {
    payments.push(payment);
  }
  return payments;
}

/** Verify a GoCardless webhook's HMAC-SHA256 signature (Webhook-Signature header). */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  const webhookSecret = process.env.GOCARDLESS_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("Webhook secret not configured");
    return false;
  }
  if (!signature) {
    console.error("[GoCardless] Missing Webhook-Signature header");
    return false;
  }

  const computedSignature = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");

  const signatureBuffer = Buffer.from(signature);
  const computedBuffer = Buffer.from(computedSignature);

  // timingSafeEqual throws if the buffers differ in length, so guard first.
  // A length mismatch already means the signature is invalid.
  if (signatureBuffer.length !== computedBuffer.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
  } catch (err) {
    console.error("[GoCardless] Signature comparison failed:", err);
    return false;
  }
}

/** Map a GoCardless mandate status to PlanMandateStatus. */
export function mapMandateStatus(gcStatus: string): string {
  const statusMap: Record<string, string> = {
    pending_submission: "PENDING",
    submitted: "PENDING",
    active: "ACTIVE",
    failed: "FAILED",
    cancelled: "CANCELLED",
    expired: "EXPIRED",
  };
  return statusMap[gcStatus] || "PENDING";
}

/** Map a GoCardless payment status to PlanPaymentStatus. */
export function mapPaymentStatus(gcStatus: string): string {
  const statusMap: Record<string, string> = {
    pending_submission: "PENDING",
    submitted: "PENDING",
    confirmed: "CONFIRMED",
    paid_out: "PAID_OUT",
    failed: "FAILED",
    cancelled: "CANCELLED",
    charged_back: "CHARGED_BACK",
  };
  return statusMap[gcStatus] || "PENDING";
}
