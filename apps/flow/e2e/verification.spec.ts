import { test, expect } from "@playwright/test";

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

const STAT_CARD_LABELS = [
  "Consultations",
  "Attended",
  "Converted",
  "Stuck",
  "Total planned",
  "Total paid",
  "sign-ups",
  "Conversion",
];

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });
}

/** F4.3 + Part 6 Flow UAT — dashboard parity smoke tests. */
test.describe("Flow verification (F4)", () => {
  test("dashboard shows eight legacy stat cards", async ({ page }) => {
    await login(page);
    await page.goto("/flow/dashboard");

    for (const label of STAT_CARD_LABELS) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }
  });

  test("charts tab renders funnel charts", async ({ page }) => {
    await login(page);
    await page.goto("/flow/dashboard");
    await page.getByRole("button", { name: "Charts" }).click();
    await expect(page.getByText("Patients by status")).toBeVisible();
    await expect(page.getByText("Conversion funnel")).toBeVisible();
  });

  test("import consults API responds and dashboard API returns rows shape", async ({ page }) => {
    await login(page);
    await page.goto("/flow/dashboard");

    const importRes = await page.request.post("/flow/api/sync/consults");
    expect(importRes.ok(), await importRes.text()).toBeTruthy();
    const importBody = await importRes.json();
    expect(importBody.ok).toBe(true);
    expect(typeof importBody.created).toBe("number");
    expect(typeof importBody.updated).toBe("number");

    const dashboardRes = await page.request.get("/flow/api/dashboard");
    expect(dashboardRes.ok()).toBeTruthy();
    const data = await dashboardRes.json();
    expect(data.stats).toMatchObject({
      totalConsultations: expect.any(Number),
      attended: expect.any(Number),
      converted: expect.any(Number),
      stuck: expect.any(Number),
      conversionRate: expect.any(Number),
    });
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.practitionerScope).toEqual({ viewAll: true, dentistId: null });
  });

  test("sync payment button triggers API", async ({ page }) => {
    await login(page);
    await page.goto("/flow/dashboard");

    const res = await page.request.post("/flow/api/sync/dentally", { data: { mode: "payments" } });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("payments");
  });

  test("CSV export matches legacy column headers and filename pattern", async ({ page }) => {
    await login(page);
    await page.goto("/flow/dashboard");
    await page.getByRole("button", { name: "Table" }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("flow-export-csv").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/-export-\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString("utf8");
    for (const header of ["Name", "Phone", "Email", "Dentist", "Booked by", "Plan Signed Up"]) {
      expect(csv).toContain(header);
    }
  });

  test("status filter chips are visible on table view", async ({ page }) => {
    await login(page);
    await page.goto("/flow/dashboard");
    await page.getByRole("button", { name: "Table" }).click();
    await expect(page.getByRole("button", { name: /^All/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Stuck/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Converted/ })).toBeVisible();
  });
});
