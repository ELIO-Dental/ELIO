import { test, expect } from "@playwright/test";
import { prisma } from "@elio/db";
import { FLOW_ORIGIN } from "../playwright.config";

/**
 * e2e coverage for MASTER_BUILD_GUIDE.md §1.8's required flow (line 911-912):
 * new enquiry -> consult -> outcome accepted -> reporting shows updated
 * conversion numbers.
 *
 * Logs in as the real seeded OWNER through the shell's real /login page
 * (same pattern as apps/pay/e2e/pay-period.spec.ts), then drives every step
 * as a real HTTP request against the real flow API routes using
 * `page.request` — which is bound to the page's own browser context and so
 * shares the session cookie set by the real login (the top-level `request`
 * fixture is a SEPARATE APIRequestContext with its own cookie jar and does
 * NOT see that cookie — confirmed live: using it here made every call
 * silently 307 to /login, returning a 200 HTML login page instead of JSON).
 * These are genuine authenticated requests through NextAuth's session check,
 * not UI-only mocking:
 *   - POST /flow/api/enquiries            (captureEnquiry)
 *   - POST /flow/api/pipeline/move        (moveStage: creates the Consult)
 *   - POST /flow/api/consults/[id]/outcome (recordOutcome: ACCEPTED)
 *   - GET  /flow/api/reporting            (getConversionReport)
 *
 * All rows created by this test are deleted in afterAll.
 */

const OWNER_EMAIL = "mi0364922@gmail.com";
const OWNER_PASSWORD = "ismaeel786";

let enquiryId: string | undefined;
let consultId: string | undefined;

test.describe.configure({ mode: "serial" });

// Dev-mode Turbopack compiles each route lazily on its first request. Warming
// every route once, before the real assertions run, avoids flaking on
// whichever route happens to be "first" in a given run (see
// apps/plans/e2e/signup.spec.ts's identical rationale).
test.beforeAll(async ({ request }) => {
  await request.get(`${FLOW_ORIGIN}/flow/pipeline`).catch(() => {});
  await request.get(`${FLOW_ORIGIN}/flow/reporting`).catch(() => {});
  await request.get(`${FLOW_ORIGIN}/flow/api/reporting`).catch(() => {});
});

test.afterAll(async () => {
  if (consultId) {
    await prisma.reminder.deleteMany({ where: { consultId } });
    await prisma.consult.deleteMany({ where: { id: consultId } });
  }
  if (enquiryId) {
    await prisma.enquiry.deleteMany({ where: { id: enquiryId } });
  }
  await prisma.$disconnect();
});

test("new enquiry -> consult -> outcome accepted -> reporting shows updated conversion numbers", async ({
  page,
}) => {
  // 1. Log in as the seeded OWNER through the shell's real credentials flow —
  // this establishes the real NextAuth session cookie that every flow API
  // route (requirePermission/requireSession) checks.
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });

  // page.request shares this browser context's cookies (see the file-level
  // comment above) — the top-level `request` fixture does not.
  const request = page.request;

  // 2. Baseline conversion count, read BEFORE this test's writes.
  const baselineRes = await request.get("/flow/api/reporting");
  expect(baselineRes.ok(), await baselineRes.text()).toBeTruthy();
  const baseline = await baselineRes.json();
  const baselineConverted: number = baseline.converted;

  // 3. Create a real Enquiry.
  const enquiryRes = await request.post("/flow/api/enquiries", {
    data: { source: `e2e-pipeline-${Date.now()}` },
  });
  expect(enquiryRes.ok(), await enquiryRes.text()).toBeTruthy();
  const enquiry = await enquiryRes.json();
  enquiryId = enquiry.id;
  expect(enquiryId).toBeTruthy();

  // 4. Drag the card out of Capture — the real moveStage() code path, which
  // creates the Consult row for a bare Enquiry (same route pipeline-board.tsx
  // calls on a real drag-drop).
  const moveRes = await request.post("/flow/api/pipeline/move", {
    data: { cardId: enquiryId, toColumn: "consult_quote" },
  });
  expect(moveRes.ok(), await moveRes.text()).toBeTruthy();
  const moved = await moveRes.json();
  consultId = moved.consult.id;
  expect(consultId).toBeTruthy();

  // 5. Record the outcome as ACCEPTED via the real route/service function.
  const outcomeRes = await request.post(`/flow/api/consults/${consultId}/outcome`, {
    data: { outcome: "ACCEPTED" },
  });
  expect(outcomeRes.ok(), await outcomeRes.text()).toBeTruthy();
  const outcome = await outcomeRes.json();
  expect(outcome.outcome).toBe("ACCEPTED");

  // 6. Reporting must now show exactly one more converted consult than the
  // baseline taken before this test's writes.
  const afterRes = await request.get("/flow/api/reporting");
  expect(afterRes.ok(), await afterRes.text()).toBeTruthy();
  const after = await afterRes.json();
  expect(after.converted).toBe(baselineConverted + 1);
});
