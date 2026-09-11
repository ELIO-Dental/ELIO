import { notFound } from "next/navigation";
import { auth } from "@elio/auth";
import { scopedDb, type Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { redirectToLogin, redirectToLauncher } from "@/lib/session";
import { canPayViewAny } from "@/lib/pay-scope";
import { loadPeriodOccupancy } from "@/lib/dentally-occupancy-service";
import { formatPayPeriodMonthLabel } from "@/lib/pay-dashboard-labels";
import { OccupancyTable } from "./occupancy-table";

/** Diary occupancy / white-space report for a pay period — AuraPay parity (Step 25 audit). */
export default async function PeriodOccupancyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.practiceId || !session.userId) return redirectToLogin();
  if (!canPayViewAny({ role: session.role as Role })) {
    return redirectToLauncher("error=forbidden");
  }
  const { id } = await params;
  const db = scopedDb(session.practiceId);
  const payPeriod = await db.payPeriod.findUnique({ where: { id } });
  if (!payPeriod) notFound();

  const { results } = await loadPeriodOccupancy(session.practiceId, id);

  return (
    <PageContent>
      <PageHeader
        title="Diary occupancy"
        description={`${formatPayPeriodMonthLabel(payPeriod.periodStart)} — chair-time occupancy and white space per dentist, based on synced appointments against a default Mon–Fri working week.`}
      />
      <div className="mt-8">
        <OccupancyTable rows={results} />
      </div>
    </PageContent>
  );
}
