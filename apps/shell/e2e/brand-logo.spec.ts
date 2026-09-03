import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

/**
 * Login page logos — no auth required. Verifies CSS theme swap + fixed box
 * so light/dark wordmarks match size.
 */
test.describe("Portal brand logo (light/dark)", () => {
  test("light theme shows light wordmark at expected size", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("elio-theme", "light");
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const logo = page.getByTestId("auth-brand-logo");
    await expect(logo).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await expect(logo.locator("img.elio-brand-logo-light")).toHaveAttribute(
      "src",
      /\/brand\/elio-portal\.png$/
    );
    await expect(logo.locator("img.elio-brand-logo-light")).toBeVisible();
    await expect(logo.locator("img.elio-brand-logo-dark")).toBeHidden();

    const box = await logo.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.width).toBeGreaterThanOrEqual(200);
  });

  test("dark theme shows dark wordmark at same box size as light", async ({ browser }) => {
    const lightContext = await browser.newContext();
    const lightPage = await lightContext.newPage();
    await lightPage.addInitScript(() => {
      localStorage.setItem("elio-theme", "light");
    });
    await lightPage.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(lightPage.getByTestId("auth-brand-logo")).toBeVisible({ timeout: 60_000 });
    const lightBox = await lightPage.getByTestId("auth-brand-logo").boundingBox();
    await lightContext.close();

    const darkContext = await browser.newContext();
    const darkPage = await darkContext.newPage();
    await darkPage.addInitScript(() => {
      localStorage.setItem("elio-theme", "dark");
    });
    await darkPage.goto("/login", { waitUntil: "domcontentloaded" });
    const logo = darkPage.getByTestId("auth-brand-logo");
    await expect(logo).toBeVisible({ timeout: 60_000 });
    await expect(darkPage.locator("html")).toHaveAttribute("data-theme", "dark");

    await expect(logo.locator("img.elio-brand-logo-dark")).toHaveAttribute(
      "src",
      /\/brand\/elio-portal-dark\.png$/
    );
    await expect(logo.locator("img.elio-brand-logo-dark")).toBeVisible();
    await expect(logo.locator("img.elio-brand-logo-light")).toBeHidden();

    const darkBox = await logo.boundingBox();
    expect(lightBox).toBeTruthy();
    expect(darkBox).toBeTruthy();
    expect(Math.abs(darkBox!.width - lightBox!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(darkBox!.height - lightBox!.height)).toBeLessThanOrEqual(2);
    await darkContext.close();
  });
});

const SIDEBAR_EMAIL = "e2e-brand-logo@elio.dev";
const SIDEBAR_PASSWORD = "correct-horse-battery-staple";
const SIDEBAR_PRACTICE = "e2e-brand-logo-practice";

test.describe("Sidebar brand logo (logged in)", () => {
  test.beforeAll(async () => {
    await prisma.practice.upsert({
      where: { id: SIDEBAR_PRACTICE },
      update: {},
      create: { id: SIDEBAR_PRACTICE, name: "E2E Brand Logo Practice" },
    });
    const hashedPassword = await bcrypt.hash(SIDEBAR_PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: SIDEBAR_EMAIL },
      update: { hashedPassword, practiceId: SIDEBAR_PRACTICE, active: true, role: "OWNER" },
      create: {
        email: SIDEBAR_EMAIL,
        hashedPassword,
        role: "OWNER",
        practiceId: SIDEBAR_PRACTICE,
      },
    });
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: SIDEBAR_EMAIL } });
    await prisma.practice.deleteMany({ where: { id: SIDEBAR_PRACTICE } });
    await prisma.$disconnect();
  });

  test("sidebar logo is vertically centered and same size in light and dark", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("elio-theme", "light");
    });
    await page.goto("/login");
    await page.getByLabel("Email").fill(SIDEBAR_EMAIL);
    await page.getByLabel("Password").fill(SIDEBAR_PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.waitForURL(/\/launcher$/, { timeout: 60_000 });

    const brand = page.getByTestId("portal-brand");
    const headerRow = page.locator("aside").locator("div.relative.flex.h-20").first();
    await expect(brand).toBeVisible();
    await expect(headerRow).toBeVisible();

    const lightImg = brand.locator("img.elio-brand-logo-light");
    await expect(lightImg).toBeVisible();
    await expect(brand.locator("img.elio-brand-logo-dark")).toBeHidden();

    const lightMetrics = await page.evaluate(() => {
      const brandEl = document.querySelector('[data-testid="portal-brand"]') as HTMLElement | null;
      const headerEl = document.querySelector("aside div.relative.flex.h-20") as HTMLElement | null;
      const imgEl = brandEl?.querySelector("img.elio-brand-logo-light") as HTMLElement | null;
      if (!brandEl || !headerEl || !imgEl) return null;
      const b = brandEl.getBoundingClientRect();
      const h = headerEl.getBoundingClientRect();
      const i = imgEl.getBoundingClientRect();
      return {
        brand: { y: b.y, height: b.height, width: b.width },
        header: { y: h.y, height: h.height },
        img: { y: i.y, height: i.height, width: i.width },
      };
    });
    expect(lightMetrics).toBeTruthy();
    const lightOffset =
      lightMetrics!.img.y +
      lightMetrics!.img.height / 2 -
      (lightMetrics!.header.y + lightMetrics!.header.height / 2);
    expect(Math.abs(lightOffset)).toBeLessThanOrEqual(4);
    expect(lightMetrics!.img.width).toBeGreaterThanOrEqual(160);
    expect(lightMetrics!.img.height).toBeGreaterThanOrEqual(40);

    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const darkImg = brand.locator("img.elio-brand-logo-dark");
    await expect(darkImg).toBeVisible();
    await expect(brand.locator("img.elio-brand-logo-light")).toBeHidden();

    const darkMetrics = await page.evaluate(() => {
      const brandEl = document.querySelector('[data-testid="portal-brand"]') as HTMLElement | null;
      const headerEl = document.querySelector("aside div.relative.flex.h-20") as HTMLElement | null;
      const imgEl = brandEl?.querySelector("img.elio-brand-logo-dark") as HTMLElement | null;
      if (!brandEl || !headerEl || !imgEl) return null;
      const h = headerEl.getBoundingClientRect();
      const i = imgEl.getBoundingClientRect();
      return {
        header: { y: h.y, height: h.height },
        img: { y: i.y, height: i.height, width: i.width },
      };
    });
    expect(darkMetrics).toBeTruthy();
    const darkOffset =
      darkMetrics!.img.y +
      darkMetrics!.img.height / 2 -
      (darkMetrics!.header.y + darkMetrics!.header.height / 2);
    expect(Math.abs(darkOffset)).toBeLessThanOrEqual(4);
    expect(Math.abs(darkMetrics!.img.width - lightMetrics!.img.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(darkMetrics!.img.height - lightMetrics!.img.height)).toBeLessThanOrEqual(2);
  });
});
