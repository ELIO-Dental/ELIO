// Shared NextAuth config, session helpers, RBAC/permissions — Step 1.2
// per project-docs/PERMISSIONS_MATRIX.md.
import NextAuth from "next-auth";
import { authConfig } from "./config";
import { adminAuthConfig } from "./admin-config";
// Side-effect import so the `next-auth` Session/JWT module augmentation in
// ./types.d.ts is pulled into any consumer's TS program transitively (a
// standalone .d.ts with no explicit import isn't picked up by a downstream
// app's tsc run otherwise — surfaced by apps/shell's dentally sync route
// being the first shell code to read `session.practiceId`).
import "./types";

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

// Step 2.3 — kept as a distinct named export (rather than having every
// requireSession()-style helper import `auth` directly) so the choice of
// "how a session is read" stays centralized in one place, in case a future
// need (impersonation-aware or otherwise) arises again. Tried making this an
// implicit AsyncLocalStorage-context-entry point for impersonation's dual-
// identity audit logging — confirmed LIVE (2026-08-27) that the context does
// NOT survive across this Next.js/Turbopack runtime's internal async
// boundaries between here and a later writeAuditLog() call in the same
// request, even called from a plain async function the caller awaits
// directly. Dual-identity attribution is instead handled explicitly via
// `resolveAuditActor()` (lib/audit-log.ts) at each writeAuditLog() call site.
export const getSession = auth;

// Step 2.3 — a genuinely separate NextAuth instance for apps/admin. Distinct
// from the export above: different config object, different cookie name
// (admin-config.ts), and — critically, at the deployment level — apps/admin
// must set its own separately-generated NEXTAUTH_SECRET so tokens from one
// instance are cryptographically unverifiable by the other, not just
// logically separate code paths.
export const { handlers: adminHandlers, auth: adminAuth, signIn: adminSignIn, signOut: adminSignOut } = NextAuth(adminAuthConfig);

export { authConfig } from "./config";
export { adminAuthConfig } from "./admin-config";
export * from "./lib/mfa";
export * from "./lib/password-reset";
export * from "./lib/permissions";
export * from "./lib/rate-limit";
export * from "./lib/audit-log";
export * from "./lib/invite";
export * from "./lib/encryption";
export * from "./lib/licence";
export * from "./lib/impersonation";
