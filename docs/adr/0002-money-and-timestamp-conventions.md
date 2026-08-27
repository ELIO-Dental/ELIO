# ADR-0002: Money as integer pence, timestamps always timezone-aware

Date: 2026-08-17
Status: Accepted

## Context

`00_SCOPE.md` NFR-2 requires: "Money stored in pence as integers, never
floats. All timestamps timezone-aware." `DATA_MODEL.md` §1 restates this as a
non-negotiable rule for every model, every field, in every future migration
(Steps 1.6 ElioPay, 1.7 ElioPlans, 1.8 ElioFlow included). ElioPlans' existing
schema (`ElioPlans/prisma/schema.prisma`, referenced but not modified) uses
`Decimal @db.Decimal(10, 2)` for money (`Plan.monthlyPrice`,
`Payment.amount`) — this is the pattern being deliberately broken from, not
copied, when those models are ported into `packages/db`.

## Decision

- **Every money field in `packages/db/prisma/schema.prisma` is `Int`,**
  named with a unit-bearing suffix (`amountPence`, `monthlyPricePence`,
  `udaRatePence`, `finalPayPence`, etc.) — never a bare `amount`, never
  `Float`, never `Decimal`. This applies to every model in this schema,
  including the ElioPay/ElioPlans/ElioFlow draft models added in Step 1.3
  ahead of their full business logic (Steps 1.6–1.8), so no later migration
  has to retrofit the type.
- **Every timestamp field is Prisma `DateTime`.** On Postgres, Prisma's
  default column type for `DateTime` is `timestamptz` (timezone-aware) — this
  was confirmed, not assumed: Prisma's own docs and the generated migration
  SQL for this schema (`prisma/migrations/*/migration.sql`) both show
  `TIMESTAMPTZ` for every `DateTime` column, with no field in this schema
  overriding it to `@db.Timestamp` (bare, non-tz). No field in this schema
  uses `@db.Timestamp`.
- Percentage/rate fields that are genuinely fractional and not money
  themselves (`privateSplitPercent`, `PlanDiscount.percentage`) remain
  `Decimal` — NFR-2 targets money, not every numeric field. This is a
  deliberate distinction: `45.0` / `47.5` / `50.0` is a percentage, not pence.

## Alternatives considered

- **`Decimal` for money** (ElioPlans' existing pattern). Rejected — NFR-2 is
  explicit and non-negotiable; `Decimal` also complicates the "money as
  integer" invariant that downstream payroll/billing arithmetic (BUG-1,
  BUG-2, the ElioPay pay-engine formula) depends on being exact integer
  pence, not a decimal type with its own rounding behaviour.
- **Bare `timestamp` columns** via `@db.Timestamp`. Rejected — loses timezone
  information, which is exactly what caused BUG-2 (UTC day-boundary bugs in
  the old pay-period date filtering). Never used in this schema.

## Consequences

- Any PR/migration introducing a money field as `Float`/`Decimal`/`String`,
  or a bare `amount` without a `Pence` suffix, should be treated as a review
  finding against this ADR, not a style preference.
- Any PR/migration introducing `@db.Timestamp` (bare) instead of the default
  `DateTime` should be treated the same way.
- Percentage fields must be visually distinguishable from money fields by
  name alone (`XxxPercent` vs `XxxPence`) — reviewers should flag ambiguous
  names like a bare `discount` or `rate`.
