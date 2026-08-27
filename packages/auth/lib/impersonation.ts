// Step 2.3 (APPLICATION_FLOW.md §11a, PERFORMANCE_SCALABILITY.md §8) —
// impersonation session lifecycle. Kept intentionally simple and auditable:
// every state transition (start, end) writes a real AuditLog row itself, on
// top of the ImpersonationSession row that tracks the session's own window.
import { prisma } from "@elio/db";
import { writeAuditLog } from "./audit-log";

/** Hard time bound (PERFORMANCE_SCALABILITY.md §8: "e.g. 30-60 minutes") —
 * enforced twice: as the minted session JWT's own maxAge (apps/shell's
 * /api/impersonate/start route) AND independently re-checked against
 * `startedAt` on every request in authConfig's jwt() callback, so a forged
 * or unusually long-lived token can't outlive this regardless of its own
 * claimed expiry. */
export const IMPERSONATION_MAX_AGE_SECONDS = 45 * 60;

/** A start-handoff token is only redeemable for this long after creation —
 * it's a same-origin, server-generated redirect the browser follows within
 * milliseconds in the real flow, so this is a defensive window against a
 * stray/leaked link, not the primary security boundary (that's requiring a
 * real SUPER_ADMIN session to create one in the first place, see
 * apps/admin's own route). */
const HANDOFF_TOKEN_MAX_AGE_MS = 60 * 1000;

export interface StartImpersonationInput {
  superAdminUserId: string;
  targetUserId: string;
  reason?: string;
}

export class ImpersonationError extends Error {}

/** Called from apps/admin — creates the real ImpersonationSession row and
 * audit-logs the start, using the Super Admin's OWN real session (this is
 * the one action apps/admin itself performs on the Super Admin's behalf, not
 * inside an impersonation context — so writeAuditLog's normal, non-context
 * path is exactly right here). */
export async function startImpersonation(input: StartImpersonationInput) {
  const target = await prisma.user.findUnique({ where: { id: input.targetUserId } });
  if (!target) throw new ImpersonationError("User not found");
  if (target.role === "SUPER_ADMIN") throw new ImpersonationError("Cannot impersonate another Super Admin");

  const session = await prisma.impersonationSession.create({
    data: {
      superAdminUserId: input.superAdminUserId,
      impersonatedUserId: target.id,
      practiceId: target.practiceId,
      reason: input.reason,
    },
  });

  await writeAuditLog({
    actorUserId: input.superAdminUserId,
    practiceId: target.practiceId,
    action: "admin.impersonation.start",
    targetType: "User",
    targetId: target.id,
    metadata: { impersonationSessionId: session.id, reason: input.reason ?? null },
  });

  return { impersonationSessionId: session.id, targetEmail: target.email, targetRole: target.role, practiceId: target.practiceId };
}

/** Called from apps/shell's /api/impersonate/start — validates the handoff
 * token is fresh and genuinely unfinished, without mutating it (redemption
 * itself isn't what starts the clock — `startedAt`, set at creation in
 * apps/admin, is; this just gates how long the HANDOFF link itself is good
 * for, a narrower window than the impersonation session itself). */
export async function redeemImpersonationHandoff(impersonationSessionId: string) {
  const session = await prisma.impersonationSession.findUnique({ where: { id: impersonationSessionId } });
  if (!session) throw new ImpersonationError("Impersonation session not found");
  if (session.endedAt) throw new ImpersonationError("Impersonation session already ended");
  if (Date.now() - session.startedAt.getTime() > HANDOFF_TOKEN_MAX_AGE_MS) {
    throw new ImpersonationError("Impersonation handoff link has expired");
  }

  const [superAdmin, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.superAdminUserId } }),
    prisma.user.findUnique({ where: { id: session.impersonatedUserId } }),
  ]);
  if (!superAdmin || !target) throw new ImpersonationError("A party to this impersonation session no longer exists");
  if (!target.active) throw new ImpersonationError("This user is deactivated");

  return { session, superAdmin, target };
}

/** Called from apps/shell's /api/impersonate/end (via the persistent banner)
 * — ends the session and audit-logs it with the same dual-identity shape as
 * every other action taken during the session. */
export async function endImpersonation(impersonationSessionId: string) {
  const session = await prisma.impersonationSession.findUnique({ where: { id: impersonationSessionId } });
  if (!session || session.endedAt) return;

  await prisma.impersonationSession.update({ where: { id: impersonationSessionId }, data: { endedAt: new Date() } });

  await writeAuditLog({
    actorUserId: session.superAdminUserId,
    impersonatedUserId: session.impersonatedUserId,
    practiceId: session.practiceId,
    action: "admin.impersonation.end",
    targetType: "User",
    targetId: session.impersonatedUserId,
    metadata: { impersonationSessionId },
  });
}

/** Re-checked on every request in authConfig's jwt() callback — independent
 * of the JWT's own claimed expiry, per PERFORMANCE_SCALABILITY.md §8's "even
 * if the banner's End button is never clicked" requirement. */
export async function isImpersonationSessionStillValid(impersonationSessionId: string): Promise<boolean> {
  const session = await prisma.impersonationSession.findUnique({ where: { id: impersonationSessionId } });
  if (!session || session.endedAt) return false;
  return Date.now() - session.startedAt.getTime() < IMPERSONATION_MAX_AGE_SECONDS * 1000;
}
