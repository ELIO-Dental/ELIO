import { requireSession, redirectToLogin } from "@/lib/session";
import { getConversionReport } from "@/lib/flow-service";
import { PageContent, PageHeader } from "@elio/ui";
import { ReportingClient } from "./reporting-client";

export default async function ReportingPage() {
  const session = await requireSession();
  if (!session) return redirectToLogin();

  const report = await getConversionReport(session.practiceId);

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
