/**
 * Step 2.2 (MASTER_BUILD_GUIDE.md §2.2, FR-3) — backfill migration, NOT
 * optional. Server-side licence gating just went live in apps/pay/plans/flow
 * middleware.ts: any practice with zero `Licence` rows would be locked out
 * of every module on its very next request. Every practice created before
 * Step 2.1 existed (the founder's own seeded practice included) has zero
 * Licence rows today — confirmed via a real query before writing this
 * script, not assumed. This grants a PERMANENT (no trialEndsAt — these are
 * not new trial signups) active licence for all 3 built modules to every
 * practice that doesn't already have one for that module, so the new
 * licence gate doesn't retroactively break a practice that existed before
 * licensing was a concept.
 *
 * Idempotent: only creates a Licence row where one doesn't already exist for
 * that (practiceId, moduleId) — safe to re-run, will not touch a practice
 * that already has real licence state (e.g. a Step 2.1 self-serve signup's
 * genuine trial licences).
 */
import { prisma, type ModuleId } from "@elio/db";

const EXECUTE = process.argv.includes("--execute");
const MODULES: ModuleId[] = ["PAY", "PLANS", "FLOW"];

async function main() {
  const practices = await prisma.practice.findMany({ select: { id: true, name: true } });
  const summary = { practicesChecked: practices.length, licencesCreated: 0, alreadyLicensed: 0 };

  for (const practice of practices) {
    for (const moduleId of MODULES) {
      const existing = await prisma.licence.findUnique({
        where: { practiceId_moduleId: { practiceId: practice.id, moduleId } },
      });
      if (existing) {
        summary.alreadyLicensed++;
        continue;
      }
      if (EXECUTE) {
        await prisma.licence.create({
          data: { practiceId: practice.id, moduleId, active: true, grantedAt: new Date(), trialEndsAt: null },
        });
      }
      summary.licencesCreated++;
    }
  }

  console.log(EXECUTE ? "EXECUTED — data written" : "DRY RUN — nothing written");
  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
