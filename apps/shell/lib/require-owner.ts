// Server-side-only guard for the Team screen and its API routes — never rely
// on hiding the nav link alone (MASTER_BUILD_GUIDE.md Step 1.5).
import { can, getSession } from "@elio/auth";
import type { Role } from "@elio/db";

export interface OwnerSession {
  userId: string;
  practiceId: string;
  role: Role;
  // Step 2.3 — carried through so callers can pass this session directly to
  // resolveAuditActor() (packages/auth/lib/audit-log.ts) for correct
  // dual-identity attribution during an impersonation session.
  impersonating?: boolean;
  actualUserId?: string;
}

/** Returns the session if it belongs to an OWNER, or null otherwise. Callers
 * decide whether to redirect (page) or 403 (route handler). */
export async function requireOwnerSession(): Promise<OwnerSession | null> {
  const session = await getSession();
  if (!session) return null;
  const role = (session as any).role as Role;
  if (!can({ role }, "team:manage")) return null;
  return {
    userId: (session as any).userId,
    practiceId: (session as any).practiceId,
    role,
    impersonating: (session as any).impersonating,
    actualUserId: (session as any).actualUserId,
  };
}

/** Returns the session if it belongs to a role with at least VIEW access to
 * the Team screen (OWNER or ADMIN per PERMISSIONS_MATRIX.md §2 — "View Team
 * screen: OWNER ✅, ADMIN view-only"), or null otherwise. Found live
 * (2026-08-28, independent Phase 1 audit): `requireOwnerSession()` was the
 * SOLE gate on the Team page and all 3 of its API routes, so ADMIN — who
 * `permissions.ts` already correctly grants `team:view` — got a flat
 * 403/redirect instead of the documented read-only access. Callers that
 * mutate (invite, role change, deactivate, MFA toggle) must still use
 * `requireOwnerSession()`, unchanged — only the read paths (the page itself,
 * and GET /api/team/users) should accept this broader gate. */
export async function requireTeamViewSession(): Promise<(OwnerSession & { canManage: boolean }) | null> {
  const session = await getSession();
  if (!session) return null;
  const role = (session as any).role as Role;
  if (!can({ role }, "team:view")) return null;
  return {
    userId: (session as any).userId,
    practiceId: (session as any).practiceId,
    role,
    impersonating: (session as any).impersonating,
    actualUserId: (session as any).actualUserId,
    canManage: can({ role }, "team:manage"),
  };
}
