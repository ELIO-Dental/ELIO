import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { getReportingData } from "@/lib/pay-service";
import { PageContent, PageHeader } from "@elio/ui";
import { ReportingClient } from "./reporting-client";

export default async function ReportingPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const periods = await getReportingData(session.practiceId);

  return (
    <PageContent>
      <PageHeader
        title="Reporting"
        description="NHS, private, and total pay trends across every pay period."
      />

      <div className="mt-8">
        <ReportingClient initialPeriods={periods} />
      </div>
    </PageContent>
  );
}
