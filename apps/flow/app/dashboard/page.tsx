import { PageContent, PageHeader } from "@elio/ui";
import type { Role } from "@elio/db";
import { requireSession, redirectToLogin, resolveFlowScope } from "@/lib/session";
import { getFlowDashboard } from "@/lib/flow-service";
import { DashboardClient } from "./dashboard-client";

/** Default period matches legacy ElioFlow home (last 3 months). */
function defaultThreeMonthRange() {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setMonth(from.getMonth() - 3);
  from.setHours(0, 0, 0, 0);
  return { from, to };
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
    <PageContent width="xl">
      <PageHeader
        title="Dashboard"
        description="Cosmetic consultation overview — same pipeline table as classic ElioFlow, in the ELIO theme."
      />
      <div className="mt-8">
        <DashboardClient initial={data} />
      </div>
    </PageContent>
  );
}
