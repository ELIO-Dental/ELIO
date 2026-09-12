-- Password-reset/change session invalidation fix (security review, 2026-09-12).
--
-- Without this, a stolen session cookie kept working for the JWT's full
-- lifetime (default ~30 days) even after the legitimate user "recovered"
-- their account via reset-password — the reset flow changed the password but
-- never invalidated any already-issued session. The auth jwt() callback now
-- checks the token's own `iat` against this column on every request.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);
