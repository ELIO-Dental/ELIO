# Runbook: a pay run produced wrong figures

## When to use this

An ElioPay payroll run (aurapay) has been flagged as producing incorrect
totals — wrong appointment attribution, wrong date-range boundaries, or a
wrong payroll-algorithm calculation.

## First checks

1. Confirm which pay period is affected and pull its exact `startDate`/
   `endDate` boundaries via `getPayPeriodBoundaries()`
   (`ElioPay/aurapay/src/lib/period.ts`) — BUG-2 (see
   `project-docs/00_SCOPE.md` section 4) was specifically about date-boundary
   errors here, so a boundary mismatch is the first thing to rule out.
2. Check whether the discrepancy is in appointment attribution (Dentally sync
   issue) vs. the payroll algorithm itself (commission/percentage logic) vs. a
   stale/duplicate sync.
3. Re-run `src/app/api/dentally/route.ts`'s computation against the same
   period in a dev environment and diff against the flagged production output.

## Steps

_Fill in with the real resolution steps the first time this actually happens._
