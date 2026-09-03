# Portal MFA — skipped (re-enable later)

**Date:** 4 Sep 2026  
**Status:** Portal MFA is **off**. Admin MFA is **on** and working.

ELIO Portal had no MFA enrollment after invite / password set. Turning on “Require MFA for all staff” would lock people out. Admin (`admin.elioportal.co.uk`) already has authenticator setup, so it was left as-is.

---

## What we commented

| Place | What |
|--------|------|
| `packages/auth/config.ts` | Login MFA check for **Portal** (password-only sign-in) |
| `apps/shell/app/(portal)/settings/team/team-client.tsx` | “Require MFA for all staff” switch |

**Do not touch** `packages/auth/admin-config.ts` or Admin Settings MFA — that is Super Admin only.

---

## How it should work when we turn it back on

1. Staff set password from invite email.
2. Next screen: **scan QR / enter setup key** in Google Authenticator, confirm a 6-digit code.
3. Then they can sign in with password + code.
4. Owner can then enable **Require MFA for all staff**.

Until that enrollment screen exists on Portal, do not uncomment login MFA.

---

## How to re-enable (after enrollment is built)

1. In `packages/auth/config.ts`, uncomment the `mfaRequired` block and remove the `void mfaCode` / unused-class lines.
2. In `team-client.tsx`, uncomment the Security card with the MFA switch.
3. Add Profile “Set up authenticator” (copy Admin: `/api/settings/mfa/begin` + `confirm`).
4. After password reset, send users to MFA setup if the practice flag is on (or always offer it).

---

## Quick test after re-enable

- [ ] New invite: password → MFA setup → login with code  
- [ ] Owner toggle on: next login asks for code  
- [ ] Admin Super Admin MFA still works  
