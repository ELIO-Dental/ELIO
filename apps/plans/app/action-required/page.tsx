import Link from "next/link";
import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from "@elio/ui";
import { PlansNav } from "@/components/plans-nav";
import { ActionRequiredEmptyState } from "@/components/action-required-empty-state";
import { listRedeems, runReconciliation } from "@/lib/plans-service";

function currentBillingPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ActionRequiredPage() {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;
  const period = currentBillingPeriod();

  const [pendingRedeems, failedPayments, unsignedRequests, reconciliation] = await Promise.all([
    listRedeems(practiceId, "PENDING_APPROVAL"),
    prisma.planPayment.findMany({
      where: { practiceId, status: { in: ["FAILED", "CHARGED_BACK"] } },
      include: { planPatient: { include: { patient: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.planSigningRequest.findMany({
      where: { practiceId, signedAt: null, expiresAt: { gt: new Date() } },
      include: { planPatient: { include: { patient: true } }, document: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // Reconciliation has no persisted "needs review" table — it's an on-demand
    // comparison (see reconciliation/reconciliation-runner.tsx). Reuse the same
    // service function so this queue reflects live mismatches, not duplicated logic.
    runReconciliation(practiceId, period).catch(() => null),
  ]);

  const totalCount =
    pendingRedeems.length + failedPayments.length + unsignedRequests.length + (reconciliation?.mismatches.length ?? 0);

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h2 text-(--color-text-primary)">Action Required</h1>
            <p className="mt-1 text-body text-(--color-text-secondary)">
              Everything currently waiting on staff attention across plans, payments, and documents.
            </p>
          </div>
          {totalCount > 0 && <Badge variant="danger">{totalCount} item(s)</Badge>}
        </div>

        {totalCount === 0 ? (
          <div className="mt-8 rounded-(--radius-lg) border border-(--color-border)">
            <ActionRequiredEmptyState
              title="Nothing needs attention"
              description="Pending redemptions, failed payments, unsigned documents, and reconciliation mismatches will show up here."
            />
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            {pendingRedeems.length > 0 && (
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Redemptions pending approval ({pendingRedeems.length})</CardTitle>
                  <Link href="/plans/redeems?status=PENDING_APPROVAL">
                    <Button variant="secondary" size="sm">Review in Redeems</Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-(--color-border-subtle)">
                    {pendingRedeems.slice(0, 8).map((r) => {
                      const name =
                        [r.planPatient.patient.firstName, r.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                        "Unknown patient";
                      return (
                        <li key={r.id} className="flex items-center justify-between py-3">
                          <span className="text-body-sm text-(--color-text-primary)">{name}</span>
                          <span className="text-body-sm text-(--color-text-secondary)">{r.itemName}</span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}

            {failedPayments.length > 0 && (
              <Card accentColor="var(--color-danger)">
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Failed / charged-back payments ({failedPayments.length})</CardTitle>
                  <Link href="/plans/payments?status=FAILED">
                    <Button variant="secondary" size="sm">Review in Payments</Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-(--color-border-subtle)">
                    {failedPayments.slice(0, 8).map((p) => {
                      const name =
                        [p.planPatient.patient.firstName, p.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                        "Unknown patient";
                      return (
                        <li key={p.id} className="flex items-center justify-between py-3">
                          <span className="text-body-sm text-(--color-text-primary)">{name}</span>
                          <Badge variant="danger">{p.status}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}

            {unsignedRequests.length > 0 && (
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Unsigned documents ({unsignedRequests.length})</CardTitle>
                  <Link href="/plans/documents">
                    <Button variant="secondary" size="sm">Review in Documents</Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-(--color-border-subtle)">
                    {unsignedRequests.slice(0, 8).map((r) => {
                      const name =
                        [r.planPatient.patient.firstName, r.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                        "Unknown patient";
                      return (
                        <li key={r.id} className="flex items-center justify-between py-3">
                          <span className="text-body-sm text-(--color-text-primary)">{name}</span>
                          <span className="text-body-sm text-(--color-text-secondary)">{r.document.title}</span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            )}

            {reconciliation && reconciliation.mismatches.length > 0 && (
              <Card accentColor="var(--color-warning)">
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>
                    Reconciliation mismatches for {reconciliation.period} ({reconciliation.mismatches.length})
                  </CardTitle>
                  <Link href="/plans/reconciliation">
                    <Button variant="secondary" size="sm">Review in Reconciliation</Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-(--color-border-subtle)">
                    {reconciliation.mismatches.slice(0, 8).map((m, i) => (
                      <li key={i} className="flex items-center justify-between py-3">
                        <Badge variant="warning">{m.type}</Badge>
                        <span className="text-body-sm text-(--color-text-secondary)">{m.detail}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
