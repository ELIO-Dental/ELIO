import { requireSession, redirectToLogin, resolveFlowScope } from "@/lib/session";
import { getConversionReport } from "@/lib/flow-service";
import { PageContent, PageHeader } from "@elio/ui";
import type { Role } from "@elio/db";
import { ReportingClient } from "./reporting-client";

export default async function ReportingPage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();

  const scope = await resolveFlowScope({
    userId: session.userId,
    practiceId: session.practiceId,
    role: session.role as Role,
    permissions: session.permissions ?? [],
  });
  const report = await getConversionReport(session.practiceId, undefined, scope);

  return (
    <PageContent>
      <PageHeader
        title="Reporting"
        description="Funnel counts and conversion rate across the pipeline. Filter by date range or leave blank for all-time."
      />

      <div className="mt-8">
        <ReportingClient initialReport={report} />
      </div>
    </PageContent>
  );
}
