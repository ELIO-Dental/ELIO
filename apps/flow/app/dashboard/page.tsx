import { PageContent, PageHeader } from "@elio/ui";
import type { Role } from "@elio/db";
import { requireSession, redirectToLogin, resolveFlowScope } from "@/lib/session";
import { getFlowDashboard } from "@/lib/flow-service";
import { DashboardClient } from "./dashboard-client";

/** Always fresh from Neon — never serve a cached SSR KPI payload. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Default = All time so Total Planned / Total Paid match classic sheet totals.
 * Period filter still offers Last 3 Months like old ElioFlow.
 */
/** F2.1 — legacy ElioFlow home dashboard (stats + table). */
export default async function DashboardPage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();

  const scope = await resolveFlowScope({
    userId: session.userId,
    practiceId: session.practiceId,
    role: session.role as Role,
    permissions: session.permissions ?? [],
  });
  const data = await getFlowDashboard(session.practiceId, { scope });

  return (
    <PageContent width="full">
      <PageHeader
        title="Pipeline"
        description="Cosmetic consultation tracking — stats, table, and charts."
      />
      <div className="mt-6 sm:mt-8">
        <DashboardClient
          key={`${data.stats.totalConsultations}-${data.stats.totalPlannedPence}-${data.stats.totalPaidPence}`}
          initial={data}
        />
      </div>
    </PageContent>
  );
}
