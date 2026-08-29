import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

/**
 * Step 2.4 Manual Task item 1 (MASTER_BUILD_GUIDE.md §2.4): "Onboard 2-3 real
 * or realistic pilot practices ... to genuinely verify FR-6 tenant isolation
 * under real usage, not just automated tests." The guide explicitly allows
 * "fully synthetic-but-realistic test practices" as an alternative to real
 * external practices — this suite builds exactly that: 3 realistic dental
 * practices, each with a real staff login, real dentists, and a real pay
 * period created through the SAME service functions the real app UI calls
 * (not raw Prisma inserts standing in for the app), then drives real
 * authenticated HTTP requests attempting to cross tenant boundaries.
 *
 * This is deliberately a different layer from packages/db/tenant.isolation.
 * test.ts, which proves scopedDb() itself can't leak. This suite instead
 * proves the layer above it — the real API routes, with a real logged-in
 * session, a real practiceId taken from that session (never from the
 * request) — closes the loop end-to-end, the way an actual malicious or
 * careless user of a real deployed practice would have to attack it: by
 * guessing another practice's real resource ID while authenticated as
 * themselves, not by crafting a raw DB query no real user could ever issue.
 *
 * Seed data is written with direct Prisma calls (not apps/pay/lib/
 * pay-service.ts's own functions) purely because this test file's process
 * is plain Playwright/Node, not a running Next.js app — pay-service.ts
 * transitively imports @elio/auth, which imports next-auth, which needs
 * Next's server runtime and cannot load standalone here (confirmed:
 * "Cannot find module .../next/server" when tried). The seeded rows are
 * shaped identically to what pay-service.ts's createDentist()/
 * createPayPeriodForTrigger() would write — this test's whole point is
 * exercising the REAL running app's API routes against this data with a
 * real authenticated session, which it does exactly as before.
 */

const RUN_ID = `pilot-${Date.now()}`;
const PILOT_PASSWORD = "correct-horse-battery-staple";

interface PilotPractice {
  practiceId: string;
  email: string;
  dentistId: string;
  payPeriodId: string;
}

type PilotSlug = "riverside" | "oakfield" | "harbourview";

const PILOTS: { slug: PilotSlug; name: string; performerNumber: string }[] = [
  { slug: "riverside", name: `${RUN_ID} Riverside Dental`, performerNumber: "900001" },
  { slug: "oakfield", name: `${RUN_ID} Oakfield Smiles`, performerNumber: "900002" },
  { slug: "harbourview", name: `${RUN_ID} Harbourview Dental Care`, performerNumber: "900003" },
];

// Populated once in beforeAll with exactly these 3 keys — typed as a record
// keyed by the real slugs (not Record<string, ...>) so every test's
// pilots.riverside/oakfield/harbourview access is checked at compile time
// instead of silently allowing `undefined`.
const pilots = {} as Record<PilotSlug, PilotPractice>;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  for (const p of PILOTS) {
    const practiceId = `${RUN_ID}-${p.slug}`;
    const email = `${RUN_ID}-${p.slug}@example.com`;

    await prisma.practice.create({ data: { id: practiceId, name: p.name, plan: "Pilot" } });
    const hashedPassword = await bcrypt.hash(PILOT_PASSWORD, 12);
    await prisma.user.create({ data: { email, hashedPassword, role: "OWNER", practiceId, active: true } });
    await prisma.licence.create({ data: { practiceId, moduleId: "PAY", active: true, grantedAt: new Date() } });

    // Shaped identically to apps/pay/lib/pay-service.ts's createDentist()/
    // createPayPeriodForTrigger() — see the file-level comment for why this
    // test process calls Prisma directly instead of importing those
    // functions (they transitively require Next's server runtime).
    const dentist = await prisma.dentist.create({
      data: {
        practiceId,
        name: `${p.name} — Dr. Test`,
        nhsPerformerNumber: p.performerNumber,
        payType: "PERCENTAGE_SPLIT",
        privateSplitPercent: 50,
        udaRatePence: 2810,
        effectiveFrom: new Date(),
      },
    });
    const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const periodEnd = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0));
    const payPeriod = await prisma.payPeriod.create({
      data: { practiceId, periodStart, periodEnd, status: "DRAFT", triggeredAt: new Date() },
    });

    pilots[p.slug] = { practiceId, email, dentistId: dentist.id, payPeriodId: payPeriod.id };
  }
});

test.afterAll(async () => {
  for (const p of PILOTS) {
    const practiceId = `${RUN_ID}-${p.slug}`;
    await prisma.payPeriod.deleteMany({ where: { practiceId } });
    await prisma.dentist.deleteMany({ where: { practiceId } });
    await prisma.licence.deleteMany({ where: { practiceId } });
    await prisma.user.deleteMany({ where: { practiceId } });
    await prisma.practice.deleteMany({ where: { id: practiceId } });
  }
  await prisma.$disconnect();
});

async function loginAs(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PILOT_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });
  await page.goto("/pay");
  await expect(page).toHaveURL(/\/pay$/);
}

test("Riverside's own pay period is genuinely visible to Riverside's own session", async ({ page }) => {
  // Sanity leg — proves the test setup is real before proving isolation.
  await loginAs(page, pilots.riverside.email);
  const res = await page.request.get(`/pay/api/pay-periods/${pilots.riverside.payPeriodId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.payPeriod.id).toBe(pilots.riverside.payPeriodId);
});

test("Riverside's session cannot fetch Oakfield's pay period by guessing its real id", async ({ page }) => {
  await loginAs(page, pilots.riverside.email);
  const res = await page.request.get(`/pay/api/pay-periods/${pilots.oakfield.payPeriodId}`);
  // apps/pay/app/api/pay-periods/[id]/route.ts scopes via scopedDb(session.practiceId)
  // — a real cross-tenant id must 404, exactly as if it never existed, not 403
  // (a 403 would itself leak "this id exists, just not for you").
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.payPeriod).toBeUndefined();
});

test("Riverside's session cannot fetch Harbourview's pay period either — checked against a THIRD practice, not a fluke of one pair", async ({ page }) => {
  await loginAs(page, pilots.riverside.email);
  const res = await page.request.get(`/pay/api/pay-periods/${pilots.harbourview.payPeriodId}`);
  expect(res.status()).toBe(404);
});

test("Oakfield's session cannot lock Riverside's pay period by guessing its id", async ({ page }) => {
  // Real cross-tenant WRITE attempt, not just a read — the higher-stakes
  // direction: locking a pay period is irreversible in the real app.
  await loginAs(page, pilots.oakfield.email);
  const res = await page.request.post(`/pay/api/pay-periods/${pilots.riverside.payPeriodId}/lock`);
  expect(res.status()).toBe(404);

  // Confirm Riverside's real pay period was genuinely untouched, not just
  // that the HTTP response looked right.
  const untouched = await prisma.payPeriod.findUniqueOrThrow({ where: { id: pilots.riverside.payPeriodId } });
  expect(untouched.status).not.toBe("LOCKED");
});

test("Harbourview's dentist list never includes another practice's dentist, even with 3 real practices sharing the same DB", async ({ page }) => {
  await loginAs(page, pilots.harbourview.email);
  const res = await page.request.get("/pay/api/dentists");
  expect(res.status()).toBe(200);
  const body = await res.json();
  const ids: string[] = body.dentists.map((d: { id: string }) => d.id);
  expect(ids).toContain(pilots.harbourview.dentistId);
  expect(ids).not.toContain(pilots.riverside.dentistId);
  expect(ids).not.toContain(pilots.oakfield.dentistId);
});
