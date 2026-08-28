-- Closes a real structural gap found live (2026-08-28, independent Phase 1
-- audit): PlanPayment's BUG-1 idempotency guarantee
-- (@@unique([patientPlanEnrolmentId, billingPeriod])) has both columns
-- nullable, and Postgres does not enforce uniqueness across NULL values in
-- a composite constraint — so a row with either column null gets ZERO
-- protection from that constraint.
--
-- In the CURRENT codebase this is not yet exploitable: the only two
-- PlanPayment creation call sites (apps/plans/lib/plans-service.ts) are
-- createCharge() (always populates both composite columns with real
-- values) and createPaymentFromGoCardless() (always has a real, non-null
-- gocardlessPaymentId, which carries its OWN separate @unique constraint
-- and provides idempotency independent of the composite one). But the
-- schema's own comment says the composite constraint "MUST survive every
-- future migration" — implying it's meant to be a durable, standalone
-- guarantee, not one that happens to hold only because of how today's code
-- behaves. A future ad-hoc charge-creation path with neither an enrolment
-- reference nor a GoCardless payment id would have had NO idempotency
-- protection from ANY mechanism, DB or app-level.
--
-- Fix: a CHECK constraint requiring every row to carry at least one of the
-- two real uniqueness anchors (the composite key OR gocardlessPaymentId).
-- Any row satisfying this is guaranteed to be covered by one of the two
-- existing unique constraints — this doesn't change either constraint,
-- just closes the "neither anchor present" case structurally, at the DB
-- level, so it can never silently ship regardless of what future
-- application code does or forgets to do.
ALTER TABLE "plans_payments"
  ADD CONSTRAINT "plans_payments_has_idempotency_anchor"
  CHECK ("patientPlanEnrolmentId" IS NOT NULL OR "gocardlessPaymentId" IS NOT NULL);
