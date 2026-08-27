# Runbook: GoCardless webhook stopped firing

## When to use this

ElioPlans membership charges/statuses stop updating — payments show as
`pending_submission` past when they should have progressed, or new charges
aren't appearing at all.

## First checks

1. Check GoCardless dashboard → Developers → Webhooks for recent delivery
   failures/signature errors against `src/app/api/webhooks/gocardless/route.ts`.
2. Confirm the webhook signing secret in the app's env vars still matches
   what GoCardless has configured (`verifyWebhookSignature` in
   `ElioPlans/src/lib/gocardless.ts` fails closed — a mismatch silently drops
   every event with a 401).
3. As a stopgap, run `src/app/api/cron/reconcile-payments/route.ts` manually —
   it independently pulls actual GoCardless payment state and will surface
   the drift even while the webhook path is broken.
4. Check `WebhookEvent` rows in the DB for a gap in `createdAt` timestamps to
   bound how long the outage lasted.

## Steps

_Fill in with the real resolution steps the first time this actually happens._
