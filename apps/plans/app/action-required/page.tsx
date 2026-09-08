import Link from "next/link";
import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import { Badge, Button, PageContent, PageHeader } from "@elio/ui";
import { ActionRequiredEmptyState } from "@/components/action-required-empty-state";
import { PlansMetricTile, PlansSection } from "@/components/plans-page-chrome";
import { listRedeems, runReconciliation } from "@/lib/plans-service";
import { AlertCircle, Clock, FileSignature, UserPlus } from "lucide-react";

function currentBillingPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";

export default async function ActionRequiredPage() {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;
  const period = currentBillingPeriod();

  const [pendingRedeems, failedPayments, unsignedRequests, invitedPatients, reconciliation] = await Promise.all([
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
    prisma.planPatient.findMany({
      where: { practiceId, status: "INVITED" },
      include: { patient: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    runReconciliation(practiceId, period).catch(() => null),
  ]);

  const totalCount =
    pendingRedeems.length +
    failedPayments.length +
    unsignedRequests.length +
    invitedPatients.length +
    (reconciliation?.mismatches.length ?? 0);

  return (
    <PageContent width="full">
      <PageHeader
        title="Action Required"
        description="Everything currently waiting on staff attention across plans, payments, and documents."
        actions={totalCount > 0 ? <Badge variant="danger">{totalCount} item(s)</Badge> : undefined}
      />

      {totalCount > 0 ? (
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-3">
          <PlansMetricTile
            label="Pending redeems"
            value={pendingRedeems.length}
            tone="warning"
            icon={<Clock className="size-5" aria-hidden />}
          />
          <PlansMetricTile
            label="Failed payments"
            value={failedPayments.length}
            tone="danger"
            icon={<AlertCircle className="size-5" aria-hidden />}
          />
          <PlansMetricTile
            label="Invited"
            value={invitedPatients.length}
            icon={<UserPlus className="size-5" aria-hidden />}
          />
          <PlansMetricTile
            label="Unsigned docs"
            value={unsignedRequests.length}
            tone="warning"
            icon={<FileSignature className="size-5" aria-hidden />}
          />
        </div>
      ) : null}

      {totalCount === 0 ? (
        <div className="mt-6 sm:mt-8">
          <PlansSection>
            <ActionRequiredEmptyState
              title="Nothing needs attention"
              description="Pending invitations, redemptions, failed payments, unsigned documents, and reconciliation mismatches will show up here."
            />
          </PlansSection>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5 sm:mt-8 sm:gap-6">
          {invitedPatients.length > 0 && (
            <PlansSection
              title={`Invited patients awaiting signup (${invitedPatients.length})`}
              actions={
                <Link href="/patients?status=INVITED">
                  <Button variant="secondary" size="sm">
                    View in Patients
                  </Button>
                </Link>
              }
            >
              <ul className="divide-y divide-(--color-border-subtle)">
                {invitedPatients.slice(0, 8).map((pp) => {
                  const name =
                    [pp.patient.firstName, pp.patient.lastName].filter(Boolean).join(" ") || "Unknown patient";
                  return (
                    <li key={pp.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/patients/${pp.id}`}
                        className="text-body-sm font-medium text-(--color-text-primary) underline-offset-2 hover:underline"
                      >
                        {name}
                      </Link>
                      <Badge variant="neutral">INVITED</Badge>
                    </li>
                  );
                })}
              </ul>
            </PlansSection>
          )}

          {pendingRedeems.length > 0 && (
            <PlansSection
              title={`Redemptions pending approval (${pendingRedeems.length})`}
              actions={
                <Link href="/redeems?status=PENDING_APPROVAL">
                  <Button variant="secondary" size="sm">
                    Review in Redeems
                  </Button>
                </Link>
              }
            >
              <ul className="divide-y divide-(--color-border-subtle)">
                {pendingRedeems.slice(0, 8).map((r) => {
                  const name =
                    [r.planPatient.patient.firstName, r.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="text-body-sm font-medium text-(--color-text-primary)">{name}</span>
                      <span className="truncate text-body-sm text-(--color-text-secondary)">{r.itemName}</span>
                    </li>
                  );
                })}
              </ul>
            </PlansSection>
          )}

          {failedPayments.length > 0 && (
            <PlansSection
              title={`Failed / charged-back payments (${failedPayments.length})`}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Link href="/payments?status=FAILED">
                    <Button variant="secondary" size="sm">
                      Review failed
                    </Button>
                  </Link>
                  <Link href="/payments?status=CHARGED_BACK">
                    <Button variant="secondary" size="sm">
                      Charged back
                    </Button>
                  </Link>
                </div>
              }
            >
              <ul className="divide-y divide-(--color-border-subtle)">
                {failedPayments.slice(0, 8).map((p) => {
                  const name =
                    [p.planPatient.patient.firstName, p.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  return (
                    <li key={p.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/patients/${p.planPatientId}`}
                        className="text-body-sm font-medium text-(--color-text-primary) underline-offset-2 hover:underline"
                      >
                        {name}
                      </Link>
                      <Badge variant="danger">{p.status}</Badge>
                    </li>
                  );
                })}
              </ul>
            </PlansSection>
          )}

          {unsignedRequests.length > 0 && (
            <PlansSection
              title={`Unsigned documents (${unsignedRequests.length})`}
              actions={
                <Link href="/documents">
                  <Button variant="secondary" size="sm">
                    Review in Documents
                  </Button>
                </Link>
              }
            >
              <ul className="divide-y divide-(--color-border-subtle)">
                {unsignedRequests.slice(0, 8).map((r) => {
                  const name =
                    [r.planPatient.patient.firstName, r.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <Link
                        href={`/patients/${r.planPatientId}`}
                        className="text-body-sm font-medium text-(--color-text-primary) underline-offset-2 hover:underline"
                      >
                        {name}
                      </Link>
                      <span className="truncate text-body-sm text-(--color-text-secondary)">{r.document.title}</span>
                    </li>
                  );
                })}
              </ul>
            </PlansSection>
          )}

          {reconciliation && reconciliation.mismatches.length > 0 && (
            <PlansSection
              title={`Reconciliation mismatches for ${reconciliation.period} (${reconciliation.mismatches.length})`}
              actions={
                <Link href="/reconciliation">
                  <Button variant="secondary" size="sm">
                    Review in Reconciliation
                  </Button>
                </Link>
              }
            >
              <ul className="divide-y divide-(--color-border-subtle)">
                {reconciliation.mismatches.slice(0, 8).map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <Badge variant="warning">{m.type}</Badge>
                    <span className="truncate text-body-sm text-(--color-text-secondary)">{m.detail}</span>
                  </li>
                ))}
              </ul>
            </PlansSection>
          )}
        </div>
      )}
    </PageContent>
  );
}
