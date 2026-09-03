// Shared NextAuth v5 (Auth.js) config — Credentials provider, JWT sessions,
// TOTP MFA (available-by-default, per-practice enforceable), used by every app
// in the monorepo that needs auth (apps/shell mounts the route handlers).
import type { NextAuthConfig } from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";
import { verifyMfaCode } from "./lib/mfa";
import { permissionsForRole } from "./lib/permissions";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "./lib/rate-limit";
import { isImpersonationSessionStillValid } from "./lib/impersonation";

class MfaRequiredError extends CredentialsSignin {
  code = "MFA_REQUIRED";
}
class MfaInvalidError extends CredentialsSignin {
  code = "MFA_INVALID";
}
class TooManyAttemptsError extends CredentialsSignin {
  code = "TOO_MANY_ATTEMPTS";
}

export const authConfig: NextAuthConfig = {
  // Auth.js only auto-trusts the incoming Host header when it detects a
  // known platform (e.g. process.env.VERCEL) — otherwise every request
  // throws UntrustedHost and 500s. Found live: a local `next start` (no
  // VERCEL env var) crashed on every /api/auth/session call. This app's
  // whole architecture is multi-zone rewrites (apps/shell/next.config.ts) —
  // effectively a reverse proxy — so relying on implicit platform detection
  // is fragile; explicit trustHost is the Auth.js-documented setting for
  // exactly this deployment shape.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "MFA code", type: "text" },
      },
      async authorize(raw) {
        const email = String(raw?.email ?? "").toLowerCase().trim();
        const password = String(raw?.password ?? "");
        const mfaCode = raw?.mfaCode ? String(raw.mfaCode) : undefined;

        if (!email || !password) return null;

        // Rate-limit by email, ahead of doing any DB/bcrypt work, so repeated
        // guesses against the same account can't proceed indefinitely.
        if (isRateLimited(email)) {
          throw new TooManyAttemptsError();
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { practice: true },
        });

        // Same generic failure whether the email doesn't exist or the password is
        // wrong — never reveal account existence (Testing 1.2 checklist).
        if (!user) {
          recordFailedAttempt(email);
          return null;
        }
        const passwordOk = await bcrypt.compare(password, user.hashedPassword);
        if (!passwordOk) {
          recordFailedAttempt(email);
          return null;
        }

        // Step 2.3 (FR-10) — a Super Admin's "Suspend tenant" action must
        // actually block login, not just be a label. Checked ahead of MFA so
        // a suspended practice's user can't even reach the MFA step.
        if (user.practice.suspendedAt) {
          recordFailedAttempt(email);
          return null;
        }

        // PORTAL MFA SKIPPED (2026-09-04) — Admin MFA is unchanged (packages/auth/admin-config.ts).
        // How to turn this back on: see docs/reference/PORTAL_MFA_SKIPPED.md
        // const mfaRequired = user.mfaEnabled || user.practice.requireMfaForAllStaff;
        // if (mfaRequired) {
        //   if (!mfaCode) {
        //     throw new MfaRequiredError();
        //   }
        //   if (!user.mfaSecret || !verifyMfaCode(user.email, user.mfaSecret, mfaCode)) {
        //     recordFailedAttempt(email);
        //     throw new MfaInvalidError();
        //   }
        // }
        void mfaCode;
        void MfaRequiredError;
        void MfaInvalidError;
        void verifyMfaCode;

        clearAttempts(email);
        return {
          id: user.id,
          email: user.email,
          practiceId: user.practiceId,
          role: user.role,
          permissions: permissionsForRole(user.role),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id as string;
        token.practiceId = (user as any).practiceId;
        token.role = (user as any).role;
        token.permissions = (user as any).permissions;
        return token;
      }

      // Re-read role/active/permissions from the DB on every request (not just
      // at sign-in) so an OWNER's permission change (or deactivation) takes
      // effect immediately in the affected user's own session — no logout
      // required, no client-side caching of stale permission state
      // (MASTER_BUILD_GUIDE.md Step 1.5 / Testing 1.5 checklist item 1).
      if (token.userId) {
        // token.userId is the IMPERSONATED user's id during an impersonation
        // session (by design — RBAC/data-scoping must treat the request as
        // that user) — so this re-check is, correctly, re-verifying the
        // impersonated user's own active/suspended status on every request,
        // not the Super Admin's. That's the intended "no lighter scrutiny"
        // behavior, not a bug: if the target account is deactivated mid-
        // impersonation, the session ends immediately, same as it would for
        // that user logging in normally.
        const dbUser = await prisma.user.findUnique({ where: { id: token.userId as string }, include: { practice: true } });
        if (!dbUser || !dbUser.active || dbUser.practice.suspendedAt) {
          // Deactivated/deleted mid-session, OR the practice was suspended
          // (Step 2.3, FR-10) mid-session — invalidate immediately, same
          // "no redeploy, no logout required" guarantee as the licence gate.
          return null;
        }
        token.role = dbUser.role;
        token.practiceId = dbUser.practiceId;
        token.permissions = permissionsForRole(dbUser.role);

        // Step 2.3 (PERFORMANCE_SCALABILITY.md §8) — the hard time bound is
        // enforced HERE, independent of the JWT's own maxAge, so a stale or
        // tampered token can't outlive it, and an explicit "End" click
        // (which sets `endedAt`) takes effect on this token's very next
        // request without needing the cookie itself to be cleared first.
        if (token.impersonating && token.impersonationSessionId) {
          const stillValid = await isImpersonationSessionStillValid(token.impersonationSessionId as string);
          if (!stillValid) return null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.userId;
      }
      (session as any).userId = token.userId;
      (session as any).practiceId = token.practiceId;
      (session as any).role = token.role;
      (session as any).permissions = token.permissions;

      // Step 2.3 — expose impersonation state to every reader of the
      // session (the persistent banner, and anything that needs to know),
      // AND establish the AsyncLocalStorage context so every AuditLog write
      // for the rest of THIS request is transparently dual-attributed
      // (lib/audit-log.ts). This runs on every auth()/useSession() call in
      // apps/shell/pay/plans/flow — the one shared choke point.
      if (token.impersonating) {
        (session as any).impersonating = true;
        (session as any).actualUserId = token.actualUserId;
        (session as any).actualUserEmail = token.actualUserEmail;
        (session as any).impersonatedUserEmail = token.impersonatedUserEmail;
        (session as any).impersonationSessionId = token.impersonationSessionId;
        // NOTE: deliberately NOT calling enterImpersonationContext() here —
        // confirmed live (2026-08-27) that AsyncLocalStorage.enterWith()
        // called from inside this NextAuth-internal callback does not
        // survive back out to the route handler's own continuation (Next.js/
        // NextAuth manage their own internal async context boundaries this
        // crosses). The context is entered instead in index.ts's `auth()`
        // wrapper, in the exact same plain async frame every caller awaits
        // directly — see that file's comment for why that one works.
      }
      return session;
    },
  },
};
