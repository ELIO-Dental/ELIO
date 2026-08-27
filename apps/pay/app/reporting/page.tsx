import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { PayNav } from "@/components/pay-nav";
import { getReportingData } from "@/lib/pay-service";
import { ReportingClient } from "./reporting-client";

export default async function ReportingPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const periods = await getReportingData(session.practiceId);

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-(--color-text-primary)">Reporting</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          NHS, private, and total pay trends across every pay period.
        </p>

        <div className="mt-8">
          <ReportingClient initialPeriods={periods} />
        </div>
      </div>
    </div>
  );
}
