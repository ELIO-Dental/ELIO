# ELIO Deploy Checklist

Use this after deploying **apps/shell**, **apps/pay**, **apps/plans**, or **apps/flow** to Vercel. Sample env files live in `elio-deploy-env/` at the repo root.

## Shell (`app.elioportal.co.uk`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Neon pooler URL |
| `DIRECT_DATABASE_URL` | Yes | Neon direct URL (migrations) |
| `NEXTAUTH_URL` | Yes | `https://app.elioportal.co.uk` |
| `NEXTAUTH_SECRET` | Yes | Unique per environment |
| `ENCRYPTION_KEY` | Yes | 32-byte hex — **never rotate without re-encrypt migration** |
| `CRON_SECRET` | Yes | Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` |
| `DENTALLY_API_KEY` | Dev / single-tenant only | Production multi-tenant: use per-practice keys via **Settings → Integrations** |
| `INNGEST_EVENT_KEY` | **Production** | From [Inngest Vercel integration](https://www.inngest.com/docs/deploy/vercel) or Inngest dashboard |
| `INNGEST_SIGNING_KEY` | **Production** | Pair with `INNGEST_EVENT_KEY` |
| `RESEND_*`, `*_APP_ORIGIN` | Yes | Email + cross-app redirects |

**Cron:** `apps/shell/vercel.json` — `0 3 * * *` → `/api/cron/dentally-sync`

**Post-deploy verify:**

```bash
SHELL_URL=https://app.elioportal.co.uk \
CRON_SECRET=... \
DATABASE_URL=... \
DENTALLY_API_KEY=... \
ENCRYPTION_KEY=... \
INNGEST_EVENT_KEY=... \
INNGEST_SIGNING_KEY=... \
npm run verify:dentally-sync
```

Expected: JSON from `/api/inngest` (not login HTML), cron returns `{ ok: true, practices, enqueued }`.

**Intentional vs legacy:** Central sync runs once daily at 03:00 UTC. Legacy Flow synced every 10 minutes 06:00–08:59 UTC; legacy Plans at 06:00 UTC. Module-specific sync (Plans plan filter, Pay period fetch) is Phase B / Y1.

## Pay (`pay.elioportal.co.uk`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Shared Neon |
| `NEXTAUTH_*` | Yes | Same session as shell |
| `DENTALLY_SITE_ID` | Multi-site practices | Legacy AuraPay used `DENTALLY_API_TOKEN` + site filter — new ELIO uses `DENTALLY_API_KEY` on shell + per-practice keys (Y1/B.4) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Optional | Only if Pay Google Sheets log import is re-enabled (legacy AuraPay); not required for Y1 Dentally fetch |

## Plans / Flow

See `elio-deploy-env/plans.env` and `elio-deploy-env/flow.env`. Plans crons: create-charges 06:00, reconcile 07:00 UTC.

## Dentally API key naming

| Legacy | New ELIO |
|--------|----------|
| ElioFlow / ElioPlans `DENTALLY_API_KEY` | `DENTALLY_API_KEY` (shell env) or encrypted `Practice.dentallyApiKey` |
| AuraPay `DENTALLY_API_TOKEN` | **Renamed** — use `DENTALLY_API_KEY` or per-practice key |

## First-time Inngest setup

1. Install Inngest integration on the **shell** Vercel project.
2. Copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` into Vercel env.
3. Deploy shell — Inngest discovers `/api/inngest` and registers `dentally-full-sync`.
4. Trigger **Sync now** from Portal → Settings → Integrations; confirm run in Inngest dashboard and `dentally_sync_runs` table.

Local dev without Inngest: set `INNGEST_DEV=1` and run `npx inngest-cli@latest dev` in a second terminal (sync uses Dev Server instead of inline fallback).
