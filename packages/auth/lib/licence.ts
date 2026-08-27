// Step 2.2 (MASTER_BUILD_GUIDE.md §2.2, FR-3) — server-side module licence
// checks. ONE implementation, called from every module zone's own
// middleware.ts (apps/pay, apps/plans, apps/flow) — never a per-page ad-hoc
// check, per the guide's explicit instruction.
import { prisma, type ModuleId } from "@elio/db";

/**
 * Always reads the DB fresh — no build-time or long-lived cache — so a
 * licence toggle in the Super Admin console (Step 2.3) takes effect on the
 * practice's very next request, no redeploy and no re-login required, per
 * the guide's explicit requirement.
 *
 * A module is licensed when: a `Licence` row exists for (practiceId,
 * moduleId), `active` is true, AND — if it's a trial (`trialEndsAt` is
 * set) — that trial hasn't actually passed yet. A trial's `active` flag is
 * only ever flipped by an explicit grant/revoke (Step 2.1/2.3); this
 * function is what actually enforces the trial's real expiry, since nothing
 * else in the system currently does.
 */
export async function isModuleLicensed(practiceId: string, moduleId: ModuleId): Promise<boolean> {
  const licence = await prisma.licence.findUnique({
    where: { practiceId_moduleId: { practiceId, moduleId } },
  });
  if (!licence || !licence.active) return false;
  if (licence.trialEndsAt && licence.trialEndsAt.getTime() < Date.now()) return false;
  return true;
}

export async function getLicensedModules(practiceId: string): Promise<ModuleId[]> {
  const licences = await prisma.licence.findMany({ where: { practiceId, active: true } });
  const now = Date.now();
  return licences.filter((l) => !l.trialEndsAt || l.trialEndsAt.getTime() >= now).map((l) => l.moduleId);
}
