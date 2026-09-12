-- Impersonation handoff replay fix (security review, 2026-09-12).
--
-- The one-time handoff link (packages/auth's redeemImpersonationHandoff) was
-- only checked for a 60s freshness window, never marked "consumed" — so the
-- same handoff URL could be redeemed repeatedly within that window (browser
-- history, shared machine, access-log leakage) to mint a fresh session as
-- the target user with no credentials at all. This column lets redemption
-- be claimed atomically (first successful UPDATE wins), distinct from
-- `endedAt` which ends the whole up-to-45-minute impersonation session, not
-- just the handoff link.

ALTER TABLE "impersonation_sessions" ADD COLUMN IF NOT EXISTS "handoffRedeemedAt" TIMESTAMP(3);
