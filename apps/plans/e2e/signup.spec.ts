import { test, expect, request as pwRequest } from "@playwright/test";
import crypto from "crypto";
import { PLANS_ORIGIN } from "../playwright.config";

/**
 * e2e coverage for MASTER_BUILD_GUIDE.md §1.7's required flow: patient signup
 * -> e-sign T&Cs -> DD mandate setup -> first charge created -> reconciliation
 * shows zero mismatch.
 *
 * GoCardless itself is never called for real: apps/plans/.env.local has
 * GOCARDLESS_ENVIRONMENT="live" (a real account), so this suite's plans
 * webServer instead runs with GOCARDLESS_MOCK_MODE="true" (see
 * playwright.config.ts), which packages/plans-engine/src/gocardless.ts reads
 * to swap in an in-memory mock GoCardless client. Every route/service
 * function under test (createMandateFlow, publicRecordMandate, createCharge,
 * runReconciliation) is the real production code — only the GoCardless SDK
 * boundary itself is faked, per the same module-boundary-mocking approach
 * packages/plans-engine's own unit tests use for the rest of the pure logic.
 *
 * Fixture setup/teardown and the billing-cycle charge/reconciliation trigger
 * go through dedicated TEST-ONLY routes (app/api/test/e2e-*) rather than the
 * UI, exactly as the task requires ("call the real service function
 * directly") — those routes 404 unless GOCARDLESS_MOCK_MODE="true", so they
 * can never be hit in a real environment.
 */

type SignupFixture = {
  token: string;
  practiceId: string;
  patientId: string;
  planId: string;
  planPatientId: string;
  enrolmentId: string;
  documentId: string;
};

test.describe.configure({ mode: "serial" });

let fixture: SignupFixture;

// Dev-mode Turbopack compiles each route lazily on its first request, not
// ahead of time. Under this suite's single-worker, single-test run, that
// first-hit compile can be slow enough that a route transiently 500s (or a
// UI step waiting on it times out) purely from compile contention — not a
// real product bug (confirmed by reproducing the exact same accept-route
// call via a bare curl immediately after a fresh boot: it succeeded
// instantly). Warming every route once, before the real assertions run,
// keeps the rest of the test deterministic instead of flaking on whichever
// route happens to be "first" in a given run.
test.beforeAll(async () => {
  const api = await pwRequest.newContext();
  await api.get(`${PLANS_ORIGIN}/plans/signup/warmup-token-does-not-exist`).catch(() => {});
  await api.get(`${PLANS_ORIGIN}/plans/api/public/signup/warmup-token-does-not-exist`).catch(() => {});
  await api.post(`${PLANS_ORIGIN}/plans/api/public/signup/warmup-token-does-not-exist/accept`, {
    data: { signatureData: "warmup" },
  }).catch(() => {});
  await api.post(`${PLANS_ORIGIN}/plans/api/public/signup/warmup-token-does-not-exist/mandate`, {
    data: { redirectUri: "http://localhost/warmup", exitUri: "http://localhost/warmup" },
  }).catch(() => {});
  await api.get(`${PLANS_ORIGIN}/plans/api/public/signup/warmup-token-does-not-exist/mandate/callback?billing_request_id=warmup`).catch(() => {});
  await api.post(`${PLANS_ORIGIN}/plans/api/webhooks/gocardless`, {
    data: "{}",
    headers: { "Content-Type": "application/json", "Webhook-Signature": "warmup" },
  }).catch(() => {});
  await api.post(`${PLANS_ORIGIN}/plans/api/test/e2e-charge`, { data: {} }).catch(() => {});
  await api.get(`${PLANS_ORIGIN}/plans/api/test/e2e-status?planPatientId=warmup&enrolmentId=warmup`).catch(() => {});
  await api.dispose();
});

test.afterAll(async () => {
  if (!fixture) return;
  const api = await pwRequest.newContext();
  await api.post(`${PLANS_ORIGIN}/plans/api/test/e2e-cleanup`, {
    data: {
      patientId: fixture.patientId,
      planPatientId: fixture.planPatientId,
      planId: fixture.planId,
      documentId: fixture.documentId,
    },
  });
  await api.dispose();
});

test("patient signup -> e-sign -> DD mandate -> first charge -> zero-mismatch reconciliation", async ({ page, request }) => {
  // 0. Create a real signup invite (Patient/PlanPatient/PlanModel/PlanDocument/
  // PlanSigningRequest/PENDING PatientPlanEnrolment), the same shape a real
  // staff member creates through the product, via the test-only setup route.
  const setupRes = await request.post(`${PLANS_ORIGIN}/plans/api/test/e2e-signup`, { data: {} });
  expect(setupRes.ok(), await setupRes.text()).toBeTruthy();
  fixture = await setupRes.json();
  expect(fixture.token).toBeTruthy();

  // 1. Visit /plans/signup/[token] UNAUTHENTICATED through the real shell
  // rewrite + shell middleware (the exact path a patient's emailed link uses,
  // and the exact path that was 307-redirecting to /login before this
  // session's PUBLIC_PATH_PREFIXES fix in apps/shell/middleware.ts).
  await page.goto(`/plans/signup/${fixture.token}`);
  await expect(page.getByText("Welcome, E2E")).toBeVisible();
  await expect(page.getByText(/E2E Test Plan/)).toBeVisible();

  // Details step -> Continue.
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. E-sign T&Cs — real POST to /api/public/signup/[token]/accept via the
  // real UI form.
  await expect(page.getByText("E2E test terms and conditions.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByLabel("Type your full name to sign").fill("E2E Tester");
  await page.getByRole("button", { name: "Agree & continue" }).click();
  await expect(page.getByRole("heading", { name: "Set up Direct Debit" })).toBeVisible();

  // 3. DD mandate step. Start the real Billing Request Flow via the real
  // route (mocked GoCardless client), then simulate GoCardless's redirect
  // back with a billing_request_id — the same real
  // publicResolveMandateFromBillingRequest()/publicRecordMandate() code path
  // the real redirect-back callback route exercises, driven here without a
  // real hosted GoCardless page to click through.
  const mandateStartRes = await request.post(
    `${PLANS_ORIGIN}/plans/api/public/signup/${fixture.token}/mandate`,
    { data: { redirectUri: "http://localhost/redirect", exitUri: "http://localhost/exit" } },
  );
  expect(mandateStartRes.ok(), await mandateStartRes.text()).toBeTruthy();
  const mandateStart = await mandateStartRes.json();
  const billingRequestId: string = mandateStart.billingRequest.id;
  expect(billingRequestId).toBeTruthy();

  await page.goto(`/plans/signup/${fixture.token}?billing_request_id=${billingRequestId}`);

  // 4. Confirm the PlanPatient/PatientPlanEnrolment flip to ACTIVE — a real
  // DB assertion via the test-only status route (state lives inside the
  // running plans server process, including the mock GoCardless store).
  await expect
    .poll(
      async () => {
        const statusRes = await request.get(
          `${PLANS_ORIGIN}/plans/api/test/e2e-status?planPatientId=${fixture.planPatientId}&enrolmentId=${fixture.enrolmentId}`,
        );
        return statusRes.json();
      },
      // Generous timeout: this is the first hit on several routes in a fresh
      // dev-mode Turbopack process each run (cold compile, not application
      // latency) — confirmed by the [WebServer] compile-trace logs alongside
      // a real 20s poll timeout with the mandate never resolving in time.
      { timeout: 60_000 },
    )
    .toMatchObject({ planPatientStatus: "ACTIVE", enrolmentStatus: "ACTIVE" });

  const statusRes = await request.get(
    `${PLANS_ORIGIN}/plans/api/test/e2e-status?planPatientId=${fixture.planPatientId}&enrolmentId=${fixture.enrolmentId}`,
  );
  const status = await statusRes.json();
  expect(status.mandate).toBeTruthy();
  expect(status.mandate.status).toBe("PENDING"); // recordMandate's real, ported-unchanged default
  expect(status.paymentCount).toBe(0);

  // 4b. In real production, GoCardless doesn't consider a mandate live until
  // it sends its own `mandates.active` webhook — recordMandate deliberately
  // leaves the mandate PENDING (asserted above) rather than assuming success.
  // runReconciliation() only builds its "expected charge" list from mandates
  // it considers ACTIVE (apps/plans/lib/plans-service.ts's runReconciliation,
  // `mandates: { where: { status: "ACTIVE" } }`), so a real zero-mismatch
  // result requires this webhook, exactly as the real webhook route/HMAC
  // verification path is exercised — not skipped or mocked away.
  const webhookBody = JSON.stringify({
    events: [
      {
        id: `EV_${fixture.token}_active`,
        resource_type: "mandates",
        action: "active",
        links: { mandate: status.mandate.gocardlessMandateId },
      },
    ],
  });
  const webhookSecret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("GOCARDLESS_WEBHOOK_SECRET must be set to sign the test webhook");
  const signature = crypto.createHmac("sha256", webhookSecret).update(webhookBody).digest("hex");
  const webhookRes = await request.post(`${PLANS_ORIGIN}/plans/api/webhooks/gocardless`, {
    data: webhookBody,
    headers: { "Content-Type": "application/json", "Webhook-Signature": signature },
  });
  expect(webhookRes.ok(), await webhookRes.text()).toBeTruthy();

  const statusAfterWebhook = await (
    await request.get(
      `${PLANS_ORIGIN}/plans/api/test/e2e-status?planPatientId=${fixture.planPatientId}&enrolmentId=${fixture.enrolmentId}`,
    )
  ).json();
  expect(statusAfterWebhook.mandate.status).toBe("ACTIVE");

  // 5. Trigger a billing-cycle charge by calling the REAL createCharge()/
  // runReconciliation() service functions directly (test-only route, not the
  // UI), the same functions the real webhook/cron path uses.
  const chargeRes = await request.post(`${PLANS_ORIGIN}/plans/api/test/e2e-charge`, {
    data: {
      practiceId: fixture.practiceId,
      planPatientId: fixture.planPatientId,
      enrolmentId: fixture.enrolmentId,
      mandateId: status.mandate.id,
      gocardlessMandateId: status.mandate.gocardlessMandateId,
      amountPence: 1999,
    },
  });
  expect(chargeRes.ok(), await chargeRes.text()).toBeTruthy();
  const chargeResult = await chargeRes.json();

  // 6. Confirm exactly one PlanPayment row for this enrolment.
  const statusAfterCharge = await (
    await request.get(
      `${PLANS_ORIGIN}/plans/api/test/e2e-status?planPatientId=${fixture.planPatientId}&enrolmentId=${fixture.enrolmentId}`,
    )
  ).json();
  expect(statusAfterCharge.paymentCount).toBe(1);
  expect(chargeResult.payment.status).toBe("CONFIRMED");
  expect(chargeResult.payment.patientPlanEnrolmentId).toBe(fixture.enrolmentId);

  // 7. runReconciliation() must show zero mismatches for THIS test's own
  // enrolment specifically — the mocked local PlanPayment and the mocked
  // matching GoCardless payment reconcile cleanly for it.
  //
  // F.5 Final QA (2026-08-29): this used to assert the WHOLE practice's
  // mismatch count is 0, which only ever passed by accident — before this
  // session, createCharge() never actually called GoCardless at all (a real
  // gap, see plans-service.ts's own comment on createCharge), so
  // runReconciliation() effectively had nothing real to compare against and
  // reconciliation logic was never genuinely exercised end-to-end by this
  // test. Now that createCharge() genuinely calls GoCardless, reconciliation
  // correctly reports every OTHER pre-existing active enrolment in this
  // shared fixture practice (e2e-signup's own route picks "the first real
  // practice" — confirmed live: 28 of them, none ever billed by this new
  // mechanism before now) as a real MISSING mismatch — which is CORRECT
  // reconciliation behavior, not a bug this test should paper over by only
  // checking the total count. Scoping the assertion to this test's own
  // enrolment is what actually proves BUG-1's fix without depending on the
  // shared fixture practice's total, unrelated billing history.
  const ownMismatches = chargeResult.reconciliation.mismatches.filter(
    (m: { patientPlanEnrolmentId: string | null }) => m.patientPlanEnrolmentId === fixture.enrolmentId,
  );
  expect(ownMismatches).toEqual([]);

  // A second createCharge call for the SAME enrolment/period must not create
  // a second row (BUG-1's idempotency guard, exercised end-to-end here too).
  const secondChargeRes = await request.post(`${PLANS_ORIGIN}/plans/api/test/e2e-charge`, {
    data: {
      practiceId: fixture.practiceId,
      planPatientId: fixture.planPatientId,
      enrolmentId: fixture.enrolmentId,
      mandateId: status.mandate.id,
      gocardlessMandateId: status.mandate.gocardlessMandateId,
      amountPence: 1999,
    },
  });
  if (!secondChargeRes.ok()) {
    console.error("SECOND CHARGE FAILED:", secondChargeRes.status(), await secondChargeRes.text());
  }
  expect(secondChargeRes.ok()).toBeTruthy();
  const statusAfterSecondCharge = await (
    await request.get(
      `${PLANS_ORIGIN}/plans/api/test/e2e-status?planPatientId=${fixture.planPatientId}&enrolmentId=${fixture.enrolmentId}`,
    )
  ).json();
  expect(statusAfterSecondCharge.paymentCount).toBe(1);
});
