/**
 * Step 2.3 (MASTER_BUILD_GUIDE.md §2.3, FR-10 detail) — Super Admin business
 * logic. Every mutating action here writes an AuditLog row (PERMISSIONS_
 * MATRIX.md §2a: "every session and every action while impersonating is
 * audit-logged with both identities" — and per ENGINEERING_CONVENTIONS.md §6,
 * every super-admin action generally, not just impersonation).
 */
import { prisma, type ModuleId } from "@elio/db";
import { writeAuditLog } from "@elio/auth";

export async function listTenants() {
  const practices = await prisma.practice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      licences: true,
      _count: { select: { users: true } },
    },
  });
  return practices;
}

export async function getTenantDetail(practiceId: string) {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    include: {
      licences: true,
      featureFlags: { include: { featureFlag: true } },
      users: { orderBy: { role: "asc" } },
    },
  });
  if (!practice) return null;

  const dentistCount = await prisma.dentist.count({ where: { practiceId } });
  return { practice, dentistCount };
}

const ALL_MODULES: ModuleId[] = ["PAY", "PLANS", "FLOW"];

export async function toggleLicence(actorUserId: string, practiceId: string, moduleId: ModuleId, active: boolean) {
  const licence = await prisma.licence.upsert({
    where: { practiceId_moduleId: { practiceId, moduleId } },
    update: { active, revokedAt: active ? null : new Date(), grantedAt: active ? new Date() : undefined },
    create: { practiceId, moduleId, active, grantedAt: active ? new Date() : undefined, revokedAt: active ? null : new Date() },
  });
  await writeAuditLog({
    actorUserId,
    practiceId,
    action: active ? "admin.licence.grant" : "admin.licence.revoke",
    targetType: "Licence",
    targetId: licence.id,
    metadata: { moduleId },
  });
  return licence;
}

export async function setPlanLabel(actorUserId: string, practiceId: string, plan: string) {
  const practice = await prisma.practice.update({ where: { id: practiceId }, data: { plan } });
  await writeAuditLog({
    actorUserId,
    practiceId,
    action: "admin.plan.change",
    targetType: "Practice",
    targetId: practiceId,
    metadata: { plan },
  });
  return practice;
}

export async function setSuspended(actorUserId: string, practiceId: string, suspended: boolean) {
  const practice = await prisma.practice.update({
    where: { id: practiceId },
    data: { suspendedAt: suspended ? new Date() : null },
  });
  await writeAuditLog({
    actorUserId,
    practiceId,
    action: suspended ? "admin.tenant.suspend" : "admin.tenant.reactivate",
    targetType: "Practice",
    targetId: practiceId,
  });
  return practice;
}

export async function toggleFeatureFlag(actorUserId: string, practiceId: string, featureFlagId: string, enabled: boolean) {
  const flag = await prisma.practiceFeatureFlag.upsert({
    where: { practiceId_featureFlagId: { practiceId, featureFlagId } },
    update: { enabled },
    create: { practiceId, featureFlagId, enabled },
  });
  await writeAuditLog({
    actorUserId,
    practiceId,
    action: enabled ? "admin.feature-flag.enable" : "admin.feature-flag.disable",
    targetType: "PracticeFeatureFlag",
    targetId: flag.id,
    metadata: { featureFlagId },
  });
  return flag;
}

export async function listFeatureFlags() {
  return prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
}

export { ALL_MODULES };
