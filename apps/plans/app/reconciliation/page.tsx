import { requireLicensedSession } from "@/lib/session";
import { PageContent, PageHeader } from "@elio/ui";
import { ReconciliationRunner } from "./reconciliation-runner";

function currentBillingPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ReconciliationPage() {
  const session = await requireLicensedSession();

  return (
    <PageContent>
      <PageHeader
        title="Reconciliation"
        description="Compare expected charges and local payments against GoCardless for a billing period. This mirrors the daily cron job (BUG-1's reconciliation logic) run on demand."
      />

      <div className="mt-8">
        <ReconciliationRunner defaultPeriod={currentBillingPeriod()} />
      </div>
    </PageContent>
  );
}
