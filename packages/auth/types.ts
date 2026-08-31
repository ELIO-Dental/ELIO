import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    userId: string;
    practiceId: string;
    role: string;
    permissions: string[];
    // Step 2.3 (APPLICATION_FLOW.md §11a) — present only on a real
    // impersonation session, minted by apps/shell's
    // /api/impersonate/start route, never by a normal login.
    impersonating?: boolean;
    actualUserId?: string;
    actualUserEmail?: string;
    impersonatedUserEmail?: string;
    impersonationSessionId?: string;
    /** Super Admin only — must complete MFA in Settings before using the console. */
    mfaSetupRequired?: boolean;
  }

  interface User {
    practiceId: string;
    role: string;
    permissions: string[];
    mfaSetupRequired?: boolean;
  }
}

// Augmenting "@auth/core/jwt" (the module next-auth/jwt purely re-exports
// from) rather than "next-auth/jwt" itself — TS's module-augmentation
// resolution is unreliable against a pure re-export target with this
// next-auth beta's package.json "exports" map.
declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    practiceId: string;
    role: string;
    permissions: string[];
    impersonating?: boolean;
    actualUserId?: string;
    actualUserEmail?: string;
    impersonatedUserEmail?: string;
    impersonationSessionId?: string;
    mfaSetupRequired?: boolean;
  }
}
