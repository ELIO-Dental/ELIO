import { PageContent, PageHeader } from "@elio/ui";
import type { Role } from "@elio/db";
import { requireSession, redirectToLogin, resolveFlowScope } from "@/lib/session";
import { getFlowDashboard } from "@/lib/flow-service";
import { flowDatePresetRange, parseLocalDateEnd, parseLocalDateStart } from "@/lib/flow-date-range";
import { DashboardClient } from "./dashboard-client";

/** Always fresh from Neon — never serve a cached SSR KPI payload. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Match classic ElioFlow home default: Last 3 Months. */
function defaultThreeMonthRange() {
  const range = flowDatePresetRange("3m");
  return {
    from: parseLocalDateStart(range.from!),
    to: parseLocalDateEnd(range.to!),
  };
}

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
  const data = await getFlowDashboard(session.practiceId, {
    scope,
    ...defaultThreeMonthRange(),
  });

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
