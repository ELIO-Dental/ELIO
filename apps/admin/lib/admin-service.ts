/**
 * Step 2.3 (MASTER_BUILD_GUIDE.md §2.3, FR-10 detail) — Super Admin business
 * logic. Every mutating action here writes an AuditLog row (PERMISSIONS_
 * MATRIX.md §2a: "every session and every action while impersonating is
 * audit-logged with both identities" — and per ENGINEERING_CONVENTIONS.md §6,
 * every super-admin action generally, not just impersonation).
 */
import { prisma, type ModuleId } from "@elio/db";
import { writeAuditLog } from "@elio/auth";

export async function listTenants(opts?: { skip?: number; take?: number }) {
  const practices = await prisma.practice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      licences: true,
      _count: { select: { users: true } },
    },
    ...(opts?.take != null ? { skip: opts.skip ?? 0, take: opts.take } : {}),
  });
  return practices;
}

export async function countTenants() {
  return prisma.practice.count();
}

export async function getTenantStats() {
  const [total, active, dentallyConnected] = await Promise.all([
    prisma.practice.count(),
    prisma.practice.count({ where: { suspendedAt: null } }),
    prisma.practice.count({ where: { dentallyConnectionStatus: "CONNECTED" } }),
  ]);
  return { total, active, dentallyConnected, suspended: total - active };
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

  const [dentistCount, dentallySyncRuns] = await Promise.all([
    prisma.dentist.count({ where: { practiceId } }),
    prisma.dentallySyncRun.findMany({
      where: { practiceId },
      orderBy: { startedAt: "desc" },
      take: 25,
    }),
  ]);
  return { practice, dentistCount, dentallySyncRuns };
}

export async function listDentallySyncRuns(practiceId: string, opts?: { take?: number; skip?: number }) {
  return prisma.dentallySyncRun.findMany({
    where: { practiceId },
    orderBy: { startedAt: "desc" },
    take: opts?.take ?? 25,
    skip: opts?.skip ?? 0,
  });
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
