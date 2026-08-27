// Step 2.3 — a SEPARATE NextAuth (Auth.js) config for apps/admin, deliberately
// NOT sharing `authConfig` (config.ts) used by apps/shell/pay/plans/flow.
// PERFORMANCE_SCALABILITY.md §7: a SUPER_ADMIN session must never validate on
// app.elioportal.co.uk and vice versa — a session-isolation bug here is a
// severe security issue, not a minor one. This is achieved two ways at once:
// (1) a genuinely distinct NextAuth() instance/cookie name below, AND
// (2) apps/admin's own .env.local MUST set its own real, separately-generated
// NEXTAUTH_SECRET, never copied from apps/shell's — even if this file were
// accidentally reused as-is, a different signing secret makes the two apps'
// JWTs mutually unverifiable. Never let these two secrets be equal in any
// real deployment.
import type { NextAuthConfig } from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";
import { verifyMfaCode } from "./lib/mfa";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "./lib/rate-limit";

class NotSuperAdminError extends CredentialsSignin {
  code = "NOT_SUPER_ADMIN";
}
class MfaRequiredError extends CredentialsSignin {
  code = "MFA_REQUIRED";
}
class MfaInvalidError extends CredentialsSignin {
  code = "MFA_INVALID";
}
class TooManyAttemptsError extends CredentialsSignin {
  code = "TOO_MANY_ATTEMPTS";
}

export const adminAuthConfig: NextAuthConfig = {
  // See authConfig's identical comment in config.ts — Auth.js only
  // auto-trusts the incoming Host header on a known platform (e.g.
  // process.env.VERCEL); explicit trustHost avoids relying on that implicit
  // detection.
  trustHost: true,
  session: {
    strategy: "jwt",
    // Distinct cookie name from apps/shell's default (`authjs.session-token`)
    // — real defense-in-depth alongside the separate NEXTAUTH_SECRET: even if
    // both apps somehow shared a domain/secret by misconfiguration, a
    // differently-NAMED cookie still wouldn't be read by the other app's
    // NextAuth instance, which only looks for its own configured cookie name.
  },
  cookies: {
    sessionToken: { name: "admin-authjs.session-token" },
  },
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

        const rateLimitKey = `admin:${email}`;
        if (isRateLimited(rateLimitKey)) {
          throw new TooManyAttemptsError();
        }

        const user = await prisma.user.findUnique({ where: { email } });

        // Same generic-failure principle as apps/shell's login (Testing 1.2)
        // — never reveal whether an email exists, or whether it exists but
        // isn't a SUPER_ADMIN. A non-SUPER_ADMIN user (even a real, valid
        // practice OWNER) is treated identically to a wrong password here —
        // PERMISSIONS_MATRIX.md §2a is explicit these capabilities are never
        // delegable, so this must fail closed, not just redirect elsewhere.
        if (!user || user.role !== "SUPER_ADMIN") {
          recordFailedAttempt(rateLimitKey);
          if (user) throw new NotSuperAdminError();
          return null;
        }
        const passwordOk = await bcrypt.compare(password, user.hashedPassword);
        if (!passwordOk) {
          recordFailedAttempt(rateLimitKey);
          return null;
        }

        // MFA mandatory, unconditionally — APPLICATION_FLOW.md §11.1 point 2,
        // PERMISSIONS_MATRIX.md §2a: unlike apps/shell's opt-in-by-default
        // (user.mfaEnabled || practice.requireMfaForAllStaff), there is no
        // "not set up yet, skip it" path here at all.
        if (!user.mfaEnabled || !user.mfaSecret) {
          throw new MfaRequiredError();
        }
        if (!mfaCode) {
          throw new MfaRequiredError();
        }
        if (!verifyMfaCode(user.email, user.mfaSecret, mfaCode)) {
          recordFailedAttempt(rateLimitKey);
          throw new MfaInvalidError();
        }

        clearAttempts(rateLimitKey);
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          // Satisfies the shared `next-auth` module augmentation (types.ts),
          // which apps/shell's real session actually relies on — vestigial
          // here (see DATA_MODEL.md's `User` section): a Super Admin's own
          // practiceId/permissions are never read for authorization in
          // apps/admin, which checks `role === "SUPER_ADMIN"` exclusively.
          practiceId: user.practiceId,
          permissions: [],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id as string;
        token.role = user.role as string;
        return token;
      }
      // Re-verify on every request, same reasoning as apps/shell's config:
      // a deactivated/deleted/demoted Super Admin loses access immediately,
      // no logout required.
      if (token.userId) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.userId as string } });
        if (!dbUser || !dbUser.active || dbUser.role !== "SUPER_ADMIN") {
          return null;
        }
        token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).userId = token.userId;
      (session as any).role = token.role;
      return session;
    },
  },
};
