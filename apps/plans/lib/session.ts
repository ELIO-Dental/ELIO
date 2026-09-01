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

/**
 * Step 2.2 (FR-3) — page-only variant: redirects instead of returning null,
 * for BOTH missing auth and a missing/expired PLANS licence. NOT used by
 * requirePermission() below (a route-handler helper — next/navigation's
 * redirect() only works from a Server Component render, not an API route
 * handler's response). Every page under apps/plans/app calls this instead of
 * requireSession() directly, so the licence gate is enforced consistently
 * without repeating the isModuleLicensed() call at each call site.
 */
export async function requireLicensedSession() {
  const session = await requireSession();
  if (!session) redirect("/login");
  if (!(await isModuleLicensed(session.practiceId, "PLANS"))) {
    redirect("/launcher?unlicensed=plans");
  }
  return session;
}

export { can };

export class UnauthorizedError extends Error {
  status = 401;
}
export class ForbiddenError extends Error {
  status = 403;
}
// Extends ForbiddenError (not Error) deliberately — every existing API route
// catches `instanceof ForbiddenError` (directly or via a shared error-mapper)
// and returns 403; this way the licence check below returns the correct
// status through existing catch blocks without editing each route.
export class UnlicensedError extends ForbiddenError {}

export interface PlansSession {
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
 * specific ElioPlans permission (PERMISSIONS_MATRIX.md §4) via the shared `can()`.
 * Mirrors apps/pay/lib/session.ts's requirePermission() exactly.
 *
 * Also enforces the module licence (Step 2.2, FR-3) — an independent audit
 * found `requireLicensedSession()` above was the ONLY page-render path that
 * checked this; every API route handler used plain `requirePermission()`,
 * which never checked a licence at all. Checking here once closes the gap
 * for every API route in this app at once.
 */
export async function requirePermission(action: string): Promise<PlansSession> {
  const session = await requireSession();
  if (!session) throw new UnauthorizedError("Not signed in");
  if (!(await isModuleLicensed(session.practiceId, "PLANS"))) {
    throw new UnlicensedError("ElioPlans is not licensed for this practice");
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

/** View payment/appointment data — full or readonly (STAFF/AUDITOR). */
export async function requireViewPayments(): Promise<PlansSession> {
  const session = await requireSession();
  if (!session) throw new UnauthorizedError("Not signed in");
  if (!(await isModuleLicensed(session.practiceId, "PLANS"))) {
    throw new UnlicensedError("ElioPlans is not licensed for this practice");
  }
  const subject: PermissionSubject = { role: session.role as Role };
  if (!can(subject, "plans:view-payments") && !can(subject, "plans:view-payments:readonly")) {
    throw new ForbiddenError("Missing permission: plans:view-payments");
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

/** Destructive patient membership edits (pause/cancel/GC link) — OWNER/ADMIN only. */
export async function requirePlansEdit(): Promise<PlansSession> {
  return requirePermission("plans:edit");
}
