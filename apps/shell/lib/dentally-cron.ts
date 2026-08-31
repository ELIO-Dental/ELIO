import { prisma } from "@elio/db";

/**
 * Practices eligible for the nightly Vercel cron sync.
 * - CONNECTED or ERROR (retry)
 * - OR has a per-practice encrypted Dentally key
 * - OR single-tenant dev: global DENTALLY_API_KEY with no per-practice keys yet
 */
export async function listPracticesForScheduledSync() {
  const withKeyOrTracked = await prisma.practice.findMany({
    where: {
      suspendedAt: null,
      OR: [
        { dentallyConnectionStatus: { in: ["CONNECTED", "ERROR"] } },
        { dentallyApiKey: { not: null } },
      ],
    },
    select: { id: true },
  });

  if (withKeyOrTracked.length > 0 || !process.env.DENTALLY_API_KEY?.trim()) {
    return withKeyOrTracked;
  }

  return prisma.practice.findMany({
    where: { suspendedAt: null },
    select: { id: true },
  });
}
