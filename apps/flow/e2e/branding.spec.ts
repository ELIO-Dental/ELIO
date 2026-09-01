import { test, expect } from "@playwright/test";

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/launcher$/, { timeout: 30_000 });
}

test("branding app name appears in sidebar after save", async ({ page }) => {
  await login(page);
  await page.goto("/flow/settings");

  const appName = page.getByLabel("App display name");
  await appName.fill("Aura Flow E2E");
  await page.getByTestId("flow-settings-save").click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  await page.goto("/flow/dashboard");
  await expect(page.getByTestId("module-brand")).toContainText("Aura Flow E2E");

  await page.goto("/flow/settings");
  await appName.fill("");
  await page.getByTestId("flow-settings-save").click();
  await expect(page.getByText("Settings saved")).toBeVisible();
});

test("dashboard CSV export uses legacy column headers", async ({ page }) => {
  await login(page);
  await page.goto("/flow/dashboard");
  await page.getByRole("button", { name: "Table" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("flow-export-csv").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-export-\d{4}-\d{2}-\d{2}\.csv$/);

  const path = await download.path();
  if (!path) throw new Error("Download path missing");
  const content = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of content) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("Name");
  expect(csv).toContain("Plan Signed Up");
  expect(csv).toContain("Booked by");
});
