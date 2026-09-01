import { PageContent, PageHeader } from "@elio/ui";
import type { Role } from "@elio/db";
import { requireSession, redirectToLogin, resolveFlowScope } from "@/lib/session";
import { getFlowDashboard } from "@/lib/flow-service";
import { DashboardClient } from "./dashboard-client";

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
    <PageContent width="xl">
      <PageHeader
        title="Pipeline"
        description="Cosmetic consultation funnel — same metrics as the legacy Flow dashboard."
      />
      <div className="mt-8">
        <DashboardClient initial={data} />
      </div>
    </PageContent>
  );
}
