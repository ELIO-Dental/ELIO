import { can, requireLicensedSession } from "@/lib/session";
import type { Role } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { getReportsData } from "@/lib/reports-service";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const session = await requireLicensedSession();
  const role = session.role as Role;
  const canViewFinancial = can({ role }, "plans:view-payments");
  const data = await getReportsData(session.practiceId);

  return (
    <PageContent>
      <PageHeader
        title="Reports"
        description="Analytics, profitability, and business intelligence."
      />
      <div className="mt-8">
        <ReportsClient data={data} canViewFinancial={canViewFinancial} />
      </div>
    </PageContent>
  );
}
