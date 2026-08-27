import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { FlowNav } from "@/components/flow-nav";
import { getConversionReport } from "@/lib/flow-service";
import { ReportingClient } from "./reporting-client";

export default async function ReportingPage() {
  const session = await requireSession();
  if (!session) redirect("/login");

  const report = await getConversionReport(session.practiceId);

  return (
    <div>
      <FlowNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Reporting</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">
          Funnel counts and conversion rate across the pipeline. Filter by date range or leave blank for all-time.
        </p>

        <ReportingClient initialReport={report} />
      </div>
    </div>
  );
}
