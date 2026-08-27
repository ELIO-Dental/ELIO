# Runbook: Dentally sync failing

## When to use this

Appointment/patient data stops updating from Dentally across any module (pay,
plans, or flow) — sync jobs erroring, timing out, or silently returning stale
data.

## First checks

1. Check for a Dentally API key expiry/rotation — confirm the key in env vars
   is still valid by hitting a lightweight Dentally endpoint directly.
2. Check for rate-limiting (HTTP 429) — Dentally sync should already back off
   and queue (see `project-docs/PERFORMANCE_SCALABILITY.md` section 1 and
   `project-docs/MASTER_BUILD_GUIDE.md` Step 1.4, once `packages/dentally`
   exists) but until that consolidation lands, check each module's own
   `lib/dentally.ts` for backoff behavior individually.
3. If a full-practice sync is involved, confirm it's running as a background
   job rather than inline in a request — inline syncs can exceed serverless
   execution limits and fail silently past a certain practice size.

## Steps

_Fill in with the real resolution steps the first time this actually happens._
