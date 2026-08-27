# Runbook: Neon point-in-time restore

## When to use this

Data corruption, a bad migration, or an accidental destructive query against
the production database, where the fix is "roll back to a known-good point in
time" rather than a forward-fixing query.

## Status

**Not yet run.** This requires the project owner's Neon dashboard access,
which this build session does not have. Per `project-docs/MASTER_BUILD_GUIDE.md`
Step 0.6, this is a required manual task before Phase 0 can be marked done:

1. In Neon → the production project → confirm point-in-time recovery (PITR)
   is enabled, and that the plan tier actually covers the retention window
   needed (patient/payment data — don't assume the free tier's window is
   enough).
2. Create a dev/test branch in Neon.
3. Restore that branch to a timestamp from a few minutes prior.
4. Confirm the restored branch has the expected data (spot-check a few rows
   against what you know changed since that timestamp).
5. Record the actual steps taken and the timing (how long the restore took)
   below, replacing this stub, so the next real incident isn't the first time
   anyone's done this.

## Steps (fill in after running the drill above)

_Not yet completed — see Status._
