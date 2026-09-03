# Runbook: Dentally sync failing

## When to use this

Appointment/patient data stops updating from Dentally across Flow, Plans, or Pay — sync jobs erroring, timing out, or returning stale data.

## First checks

1. **Portal → Settings → Integrations** — connection status, last sync result, error message.
2. **Launcher banner** — shows not connected, failed, partial, or in-progress states.
3. **Verify infra script** (from `elio/` root):

   ```bash
   SHELL_URL=https://app.elioportal.co.uk \
   CRON_SECRET=... \
   DATABASE_URL=... \
   ENCRYPTION_KEY=... \
   npm run verify:dentally-sync
   ```

   If `/api/inngest` or `/api/cron/dentally-sync` return **login HTML**, redeploy shell — middleware must exclude those routes (`apps/shell/middleware.ts` matcher).

4. **Inngest** — confirm `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` on shell Vercel project. Without them, production may use unreliable inline fallback after 202 responses.
5. **API key** — test in Integrations; confirm per-practice key or shell `DENTALLY_API_KEY` for dev.
6. **ENCRYPTION_KEY** — if decrypt fails after key rotation, re-save the Dentally API key in Integrations.

## Resolution steps

| Symptom | Action |
|---------|--------|
| `NOT_CONNECTED` / no key | Owner or admin: Settings → Integrations → Save API key → Test connection → Sync now |
| `401` / connection test failed | Rotate key in Dentally; update in Integrations |
| Sync stuck `RUNNING` | Auto-clears after **2 hours** on status load. Or `GET /api/cron/clear-stuck-dentally-sync?force=1` with Shell `CRON_SECRET`. Then Sync now. Inngest failures should call `onFailure` and mark FAILED with the real error. |
| Cron not enqueueing | Verify `CRON_SECRET` on Vercel matches bearer token; check Vercel Cron logs for `/api/cron/dentally-sync` |
| Partial sync | Review `recordErrors` on latest `DentallySyncRun`; fix upstream Dentally data issues |
| Rate limit 429 | Retry after backoff; central client already backs off per request |

## Database

Latest run per practice:

```sql
SELECT * FROM dentally_sync_runs
WHERE practice_id = '<uuid>'
ORDER BY started_at DESC
LIMIT 5;
```

## Escalation

- Multi-tenant wrong data: ensure practice uses **own** API key, not shared shell env key.
- Module-specific gaps (Plans plan import, Pay period fetch): central sync is Phase A only — see `docs/LEGACY_PARITY_ROADMAP.md` Phase B / Y1.

See also: `docs/deploy-checklist.md`.
