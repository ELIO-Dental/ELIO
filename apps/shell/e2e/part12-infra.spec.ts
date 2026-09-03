import fs from "fs";
import path from "path";
import { test, expect } from "@playwright/test";

/** Part 12 — production infrastructure smoke (local shell dev server). */
test.describe("Part 12 production infra", () => {
  test("/api/inngest is reachable without login redirect", async ({ request }) => {
    const res = await request.get("/api/inngest");
    const contentType = res.headers()["content-type"] ?? "";
    const text = await res.text();

    expect(contentType).toContain("application/json");
    expect(text).not.toContain('data-testid="login-form"');
    expect(text).not.toContain("callbackUrl=%2Fapi%2Finngest");
    expect([200, 401, 405]).toContain(res.status());
  });

  test("/api/cron/dentally-sync accepts CRON_SECRET bearer", async ({ request }) => {
    const cronSecret = process.env.CRON_SECRET?.trim();
    test.skip(!cronSecret, "CRON_SECRET missing from apps/shell/.env.local");

    const res = await request.get("/api/cron/dentally-sync", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const contentType = res.headers()["content-type"] ?? "";
    const text = await res.text();

    expect(contentType).toContain("application/json");
    expect(text).not.toContain('data-testid="login-form"');
    expect(res.ok(), text).toBeTruthy();

    const body = (await res.json()) as { ok?: boolean; practices?: number; enqueued?: number };
    expect(body.ok).toBe(true);
    expect(typeof body.practices).toBe("number");
    expect(typeof body.enqueued).toBe("number");
  });

  test("vercel.json registers nightly dentally-sync cron", () => {
    const vercelPath = path.resolve(__dirname, "../vercel.json");
    const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const dentallyCron = vercel.crons.find((c) => c.path === "/api/cron/dentally-sync");
    expect(dentallyCron).toBeDefined();
    expect(dentallyCron?.schedule).toBe("0 3 * * *");
  });
});
