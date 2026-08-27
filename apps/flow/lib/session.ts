import { can, getSession, isModuleLicensed, type PermissionSubject } from "@elio/auth";
import type { Role } from "@elio/db";

/** Loads the current session and asserts a practiceId is present — every
 * route in this app is practice-scoped (packages/db/tenant.ts). */
export async function requireSession() {
  const session = await getSession();
  if (!session?.userId || !session.practiceId) return null;
  return session;
}

export { can };

export class UnauthorizedError extends Error {
  status = 401;
}
export class ForbiddenError extends Error {
  status = 403;
}
// Extends ForbiddenError (not Error) deliberately — see apps/pay/lib/session.ts's
// identical comment for why: existing route catch blocks already map
// ForbiddenError to 403, so this returns the correct status without editing
// every route.
export class UnlicensedError extends ForbiddenError {}

export interface FlowSession {
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
 * specific ElioFlow permission (PERMISSIONS_MATRIX.md §5) via the shared can().
 * Mirrors apps/plans/lib/session.ts's requirePermission() exactly.
 *
 * Also enforces the module licence (Step 2.2, FR-3) — an independent audit
 * found NO API route in this app ever checked a licence at all; only
 * app/layout.tsx's page-render check did. Checking here once closes the gap
 * for every API route in this app at once.
 */
export async function requirePermission(action: string): Promise<FlowSession> {
  const session = await requireSession();
  if (!session) throw new UnauthorizedError("Not signed in");
  if (!(await isModuleLicensed(session.practiceId, "FLOW"))) {
    throw new UnlicensedError("ElioFlow is not licensed for this practice");
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
