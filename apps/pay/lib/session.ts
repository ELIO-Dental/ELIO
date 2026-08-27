import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { can, getSession, isModuleLicensed, type PermissionSubject } from "@elio/auth";
import type { Role } from "@elio/db";

/** Loads the current session and asserts a practiceId is present — every
 * route in this app is practice-scoped (packages/db/tenant.ts). */
export async function requireSession() {
  const session = await getSession();
  if (!session?.userId || !session.practiceId) return null;
  return session;
}

/** Redirects to a page on the SHELL app (e.g. "/login", "/launcher?...") from
 * a Server Component in this app. A plain `redirect("/login")` would get
 * auto-prefixed by Next.js with this app's OWN basePath ("/pay"), producing
 * "/pay/login" — a route that doesn't exist, since this app has no pages of
 * its own outside its module (login/launcher live only on apps/shell). Found
 * live: an unauthenticated visit to this app's own dashboard root 307'd to
 * "/pay/login" and 404'd. Building an absolute URL bypasses the auto-prefix —
 * the same fix middleware.ts already uses via `new URL("/login", req.nextUrl.origin)`.
 *
 * MUST read x-forwarded-host/x-forwarded-proto, NOT the raw Host header:
 * Next.js's multi-zone rewrite (apps/shell/next.config.ts) is a real internal
 * HTTP fetch to this app's own origin, so the raw Host header this app
 * receives is its OWN host (e.g. localhost:3001), not the shell's — Next
 * separately forwards the original client-facing host via x-forwarded-host.
 * Found live: using the raw Host header redirected to this app's own origin
 * instead of the shell's, producing a working but wrong-domain redirect. */
async function redirectToShellPath(path: string): Promise<never> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  redirect(`${proto}://${host}${path}`);
}

export async function redirectToLogin(): Promise<never> {
  return redirectToShellPath("/login");
}

export async function redirectToLauncher(query?: string): Promise<never> {
  return redirectToShellPath(query ? `/launcher?${query}` : "/launcher");
}

export { can };

export class UnauthorizedError extends Error {
  status = 401;
}
export class ForbiddenError extends Error {
  status = 403;
}
// Extends ForbiddenError (not Error) deliberately — every existing API route
// catches `instanceof ForbiddenError` and maps it to a 403; this way the new
// licence check below returns the correct status through every route's
// existing catch block without needing each one edited individually.
export class UnlicensedError extends ForbiddenError {}

export interface PaySession {
  userId: string;
  practiceId: string;
  role: Role;
  permissions: string[];
  // Step 2.3 — carried through so callers can pass this session directly to
  // resolveAuditActor() (packages/auth/lib/audit-log.ts) for correct
  // dual-identity attribution during an impersonation session.
  impersonating?: boolean;
  actualUserId?: string;
}

/**
 * Route-handler variant: throws instead of returning null, and also checks a
 * specific ElioPay permission (PERMISSIONS_MATRIX.md §3) via the shared `can()`.
 * Built on top of `requireSession()` above without changing its own null-return
 * contract (other callers of `requireSession()` are unaffected).
 *
 * Also enforces the module licence (Step 2.2, FR-3) — an independent audit
 * found this was previously checked ONLY at page-render time (app/layout.tsx),
 * never on API routes, since every module zone's middleware.ts matcher
 * excludes `/api`. That meant a revoked/expired licence still allowed full
 * API read/write access. Every route handler in this app calls
 * `requirePermission()`, so checking here — once — closes the gap for all of
 * them at once instead of requiring each route to remember its own check.
 */
export async function requirePermission(action: string): Promise<PaySession> {
  const session = await requireSession();
  if (!session) throw new UnauthorizedError("Not signed in");
  if (!(await isModuleLicensed(session.practiceId, "PAY"))) {
    throw new UnlicensedError("ElioPay is not licensed for this practice");
  }
  const subject: PermissionSubject = { role: session.role as Role };
  if (!can(subject, action)) {
    throw new ForbiddenError(`Missing permission: ${action}`);
  }
  return {
    userId: session.userId,
    practiceId: session.practiceId,
    role: session.role as Role,
    permissions: session.permissions ?? [],
    impersonating: session.impersonating,
    actualUserId: session.actualUserId,
  };
}
