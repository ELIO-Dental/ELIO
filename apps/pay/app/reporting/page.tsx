import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { getReportingData } from "@/lib/pay-service";
import { getBillsReportingData } from "@/lib/bills-reporting-service";
import { PageContent, PageHeader } from "@elio/ui";
import { ReportingClient } from "./reporting-client";

export default async function ReportingPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const [periods, bills] = await Promise.all([
    getReportingData(session.practiceId),
    getBillsReportingData(session.practiceId),
  ]);

  return (
    <PageContent>
      <PageHeader
        title="Reporting"
        description="Financial analytics, pay trends, and anomaly detection."
      />

      <div className="mt-8">
        <ReportingClient initialPeriods={periods} bills={bills} />
      </div>
    </PageContent>
  );
}
