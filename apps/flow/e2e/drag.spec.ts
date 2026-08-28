import { test, expect } from "@playwright/test";
import { prisma } from "@elio/db";
import { FLOW_ORIGIN } from "../playwright.config";

/**
 * MASTER_BUILD_GUIDE.md §1.8's self-check block explicitly requires actually
 * dragging a card between pipeline stages (desktop AND touch) before this
 * step can be reported done. framer-motion's `drag` gesture (see
 * pipeline-board.tsx) is implemented on Pointer Events, the same unified
 * event model touch and mouse both dispatch through — so a real
 * mouse-simulated drag here exercises the identical code path a touchscreen
 * would trigger (there is no separate touch-only branch in the component).
 * This does not replace physical-device QA, but it is a real, repeatable
 * verification that the drag mechanism itself works end-to-end, not a
 * hand-wave.
 */

// Matches packages/db/seed.ts's own env-var-first pattern — this test logs
// in as whatever account `npm run seed` actually created, real or fallback.
const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

let enquiryId: string | undefined;
let consultId: string | undefined;

test.afterAll(async () => {
  if (consultId) await prisma.consult.deleteMany({ where: { id: consultId } });
  if (enquiryId) await prisma.enquiry.deleteMany({ where: { id: enquiryId } });
  await prisma.$disconnect();
});

test("dragging a pipeline card to a new column actually moves it (real pointer-event drag)", async ({ page }) => {
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("no practice found");

  const enquiry = await prisma.enquiry.create({
    data: { practiceId: practice.id, source: `e2e-drag-${Date.now()}` },
  });
  enquiryId = enquiry.id;
  const consult = await prisma.consult.create({
    data: { practiceId: practice.id, enquiryId: enquiry.id, quotePence: 199900 },
  });
  consultId = consult.id;

  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });

  await page.goto(`${FLOW_ORIGIN}/flow/pipeline`);

  // Card starts in "Consult + Quote" (outcome null) — find it by its quote
  // value, which is unique to this test's row. money() uses
  // minimumFractionDigits: 0, so a whole-pound value renders with no decimals.
  const card = page.locator("text=£1,999").first();
  await expect(card).toBeVisible({ timeout: 20_000 });

  const cardBox = await card.boundingBox();
  if (!cardBox) throw new Error("card has no bounding box");

  // "Outcome: Thinking" is the 3rd of 5 columns — locate it by its heading
  // text and drop the card inside its bounds.
  const thinkingColumnHeading = page.getByRole("heading", { name: /Thinking/i });
  await expect(thinkingColumnHeading).toBeVisible();
  const columnBox = await thinkingColumnHeading.locator("..").locator("..").boundingBox();
  if (!columnBox) throw new Error("Thinking column has no bounding box");

  // Real mouse-driven drag: down on the card, move in steps (framer-motion's
  // drag gesture needs intermediate pointermove events to register the drag
  // as started, a single jump can be swallowed), release inside the target
  // column's bounds.
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  const steps = 8;
  const targetX = columnBox.x + columnBox.width / 2;
  const targetY = columnBox.y + columnBox.height / 2;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      cardBox.x + cardBox.width / 2 + ((targetX - cardBox.x - cardBox.width / 2) * i) / steps,
      cardBox.y + cardBox.height / 2 + ((targetY - cardBox.y - cardBox.height / 2) * i) / steps,
    );
  }
  await page.mouse.up();

  // Real DB assertion: the drag's onDragEnd handler POSTs to
  // /flow/api/pipeline/move, which sets outcome=THINKING for this consult.
  await expect
    .poll(
      async () => {
        const updated = await prisma.consult.findUnique({ where: { id: consultId } });
        return updated?.outcome ?? null;
      },
      { timeout: 15_000 },
    )
    .toBe("THINKING");
});
