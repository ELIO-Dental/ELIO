import { prisma } from "@elio/db";

/** Resolves a practice user to attribute cron/system audit rows to (P1.7). */
export async function resolvePracticeAuditActor(
  practiceId: string,
): Promise<{ actorUserId: string } | null> {
  const user = await prisma.user.findFirst({
    where: { practiceId, role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return user ? { actorUserId: user.id } : null;
}
