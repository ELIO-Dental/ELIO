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
    <PageContent width="full">
      <PageHeader
        title="Reconciliation"
        description="Compare expected charges and local payments against GoCardless for a billing period."
      />

      <div className="mt-6 sm:mt-8">
        <ReconciliationRunner defaultPeriod={currentBillingPeriod()} />
      </div>
    </PageContent>
  );
}
