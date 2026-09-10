import { redirectToLogin, redirectUnlessPayViewAll } from "@/lib/session";
import { auth } from "@elio/auth";
import type { Role } from "@elio/db";
import { scopedDb } from "@elio/db";
import { PageContent } from "@elio/ui";
import { MANAGED_DENTIST_WHERE } from "@/lib/active-dentists";
import { DentistsManager } from "./dentists-manager";

export default async function DentistsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  await redirectUnlessPayViewAll(session.role as Role);

  const db = scopedDb(session.practiceId);
  const dentists = await db.dentist.findMany({
    where: MANAGED_DENTIST_WHERE,
    orderBy: { name: "asc" },
  });

  return (
    <PageContent>
      <DentistsManager
        dentists={dentists.map((d) => ({
          id: d.id,
          name: d.name,
          email: d.email,
          nhsPerformerNumber: d.nhsPerformerNumber,
          dentallyPractitionerId: d.dentallyPractitionerId,
          isNhs: d.isNhs,
          active: d.active,
          // Prisma Decimal is not RSC→client serializable — coerce before props.
          privateSplitPercent:
            d.privateSplitPercent != null ? Number(d.privateSplitPercent) : null,
          udaRatePence: d.udaRatePence,
        }))}
      />
    </PageContent>
  );
}
