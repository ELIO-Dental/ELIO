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
