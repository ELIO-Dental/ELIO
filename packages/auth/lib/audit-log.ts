// Shared AuditLog writer — PERMISSIONS_MATRIX.md section 6 / MASTER_BUILD_GUIDE.md
// Step 1.5: every permission/team change writes one row (who, what, for whom, when).
import { prisma, Prisma } from "@elio/db";

export interface AuditLogInput {
  actorUserId: string;
  practiceId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  // Step 2.3 (APPLICATION_FLOW.md §11a) — set via resolveAuditActor() below
  // when the acting session is an impersonation session. Deliberately an
  // explicit field, not ambient/inferred: confirmed live (2026-08-27) that
  // AsyncLocalStorage-based implicit propagation does not survive across
  // this Next.js/Turbopack runtime's internal async boundaries between a
  // session read and a later writeAuditLog() call in the same request, even
  // from a plain async wrapper the caller awaits directly. Explicit is also
  // simply more verifiable — every call site's actual attribution is visible
  // by reading it, not inferred from request-scoped magic.
  impersonatedUserId?: string;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      impersonatedUserId: input.impersonatedUserId,
      practiceId: input.practiceId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

/**
 * Step 2.3 (APPLICATION_FLOW.md §11a) — "EVERY action taken while
 * impersonating writes an AuditLog row tagged with BOTH the real Super
 * Admin's identity AND the impersonated user's identity — never just one or
 * the other." Every writeAuditLog() call site passes the SESSION's own
 * userId as `actorUserId` — during impersonation that session's userId IS
 * the impersonated user (by design, so RBAC/data-scoping treat the request
 * as that user) — so every call site spreads this helper's result instead
 * of writing `actorUserId: session.userId` directly, to get the correct
 * dual-identity attribution without each one re-deriving the logic.
 *
 * Usage: `writeAuditLog({ ...resolveAuditActor(session), practiceId, ... })`
 */
export function resolveAuditActor(session: {
  userId: string;
  impersonating?: boolean;
  actualUserId?: string;
}): { actorUserId: string; impersonatedUserId?: string } {
  if (session.impersonating && session.actualUserId) {
    return { actorUserId: session.actualUserId, impersonatedUserId: session.userId };
  }
  return { actorUserId: session.userId };
}
