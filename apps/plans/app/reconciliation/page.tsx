import { requireLicensedSession } from "@/lib/session";
import { PlansNav } from "@/components/plans-nav";
import { ReconciliationRunner } from "./reconciliation-runner";

function currentBillingPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ReconciliationPage() {
  const session = await requireLicensedSession();

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-(--color-text-primary)">Reconciliation</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          Compare expected charges and local payments against GoCardless for a billing period.
          This mirrors the daily cron job (BUG-1's reconciliation logic) run on demand.
        </p>

        <div className="mt-8">
          <ReconciliationRunner defaultPeriod={currentBillingPeriod()} />
        </div>
      </div>
    </div>
  );
}
