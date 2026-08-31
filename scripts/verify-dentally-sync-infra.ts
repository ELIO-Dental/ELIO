#!/usr/bin/env npx tsx
/**
 * Phase A.5 — verify Dentally sync infrastructure (run from elio/ root).
 *
 * Usage:
 *   npx tsx scripts/verify-dentally-sync-infra.ts
 *   SHELL_URL=https://app.elioportal.co.uk CRON_SECRET=... npx tsx scripts/verify-dentally-sync-infra.ts
 */

const SHELL_URL = (process.env.SHELL_URL ?? "http://localhost:3000").replace(/\/$/, "");

type CheckResult = { name: string; ok: boolean; detail: string };

const checks: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}: ${detail}`);
}

function requireEnv(name: string): boolean {
  const value = process.env[name]?.trim();
  if (!value) {
    record(`env:${name}`, false, "missing");
    return false;
  }
  record(`env:${name}`, true, "set");
  return true;
}

async function main() {
  console.log(`\nDentally sync infra check — ${SHELL_URL}\n`);

  requireEnv("DATABASE_URL");
  requireEnv("DENTALLY_API_KEY");
  requireEnv("CRON_SECRET");
  requireEnv("ENCRYPTION_KEY");

  const inngestCloud = Boolean(process.env.INNGEST_EVENT_KEY?.trim());
  const inngestDev = process.env.INNGEST_DEV === "1";
  if (inngestCloud) {
    record("inngest", true, "INNGEST_EVENT_KEY set (Cloud/Dev Server mode)");
    requireEnv("INNGEST_SIGNING_KEY");
  } else if (inngestDev) {
    record("inngest", true, "INNGEST_DEV=1 (local Dev Server — run: npx inngest-cli@latest dev)");
  } else {
    record(
      "inngest",
      true,
      "not configured — manual sync uses inline fallback (dev only); set INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY for production"
    );
  }

  try {
    const res = await fetch(`${SHELL_URL}/api/inngest`, { method: "GET" });
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const isJson = contentType.includes("application/json");
    const loginHtml =
      text.includes('data-testid="login-form"') || text.includes("callbackUrl=%2Fapi%2Finngest");
    const ok =
      (res.status === 200 || res.status === 401 || res.status === 405) && isJson && !loginHtml;
    record(
      "GET /api/inngest",
      ok,
      loginHtml
        ? "HTTP 200 but login HTML — middleware still blocking /api/inngest (deploy apps/shell/middleware.ts fix)"
        : ok
          ? `HTTP ${res.status} JSON (route reachable)`
          : `HTTP ${res.status} ${isJson ? "JSON" : "non-JSON"} — expected JSON 200/401/405, not login redirect`
    );
  } catch (err) {
    record("GET /api/inngest", false, err instanceof Error ? err.message : String(err));
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    try {
      const res = await fetch(`${SHELL_URL}/api/cron/dentally-sync`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      const isJson = contentType.includes("application/json");
      const loginHtml =
        text.includes('data-testid="login-form"') ||
        text.includes("callbackUrl=%2Fapi%2Fcron%2Fdentally-sync");
      const body = isJson
        ? ((JSON.parse(text) as { ok?: boolean; practices?: number; enqueued?: number }) ?? {})
        : {};
      const ok = res.status === 200 && isJson && body.ok === true && !loginHtml;
      record(
        "GET /api/cron/dentally-sync",
        ok,
        loginHtml
          ? "HTTP 200 but login HTML — middleware still blocking cron (deploy apps/shell/middleware.ts fix)"
          : ok
            ? `HTTP 200 — practices=${body.practices ?? "?"} enqueued=${body.enqueued ?? "?"}`
            : `HTTP ${res.status} — expected JSON { ok: true }, got ${isJson ? JSON.stringify(body) : "HTML"}`
      );
    } catch (err) {
      record("GET /api/cron/dentally-sync", false, err instanceof Error ? err.message : String(err));
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${failed.length === 0 ? "All checks passed." : `${failed.length} check(s) failed.`}\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
