import Link from "next/link";
import { redirect } from "next/navigation";
import { scopedDb } from "@elio/db";
import { auth } from "@elio/auth";
import { StatCard, Card, CardHeader, CardTitle, CardContent, Badge, Button, StaggerList, StaggerItem } from "@elio/ui";
import { FileWarning } from "lucide-react";
import { PayNav } from "@/components/pay-nav";
import { MoneyStatCard } from "@/components/money-stat-card";
import { WalletEmptyState } from "@/components/wallet-empty-state";

function money(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PayDashboardPage() {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");

  const db = scopedDb(session.practiceId);
  const periods = await db.payPeriod.findMany({ orderBy: { periodStart: "desc" }, take: 6 });

  if (periods.length === 0) {
    const dentistCount = await db.dentist.count();
    return (
      <div>
        <PayNav isOwner={session.role === "OWNER"} />
        <div className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="text-h2 text-[--color-text-primary]">ElioPay dashboard</h1>
          <p className="mt-1 text-body text-[--color-text-secondary]">Run payroll & pay periods.</p>
          <WalletEmptyState
            className="mt-8"
            title="No pay periods yet"
            description={
              dentistCount === 0
                ? "Add a dentist first, then create your first pay period once a Compass statement is ready to upload."
                : "Create the first pay period once a Compass statement is ready to upload."
            }
          />
        </div>
      </div>
    );
  }

  const currentPeriod = periods[0]!;
  const [entries, dentistCount, labBills, needsReview] = await Promise.all([
    db.payslipEntry.findMany({ where: { payPeriodId: currentPeriod.id }, include: { dentist: true } }),
    db.dentist.count(),
    db.labBillEntry.findMany(),
    db.payLine.count({ where: { compassStatement: { payPeriodId: currentPeriod.id }, matchConfidence: "NEEDS_REVIEW" } }),
  ]);

  const totalOwedPence = entries.reduce((sum, e) => sum + (e.finalPayPence ?? 0), 0);
  const dentistsPaid = entries.length;
  const labDeductionsPence = labBills.reduce((sum, l) => sum + Math.round(l.amountPence / 2), 0);

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h2 text-[--color-text-primary]">ElioPay dashboard</h1>
            <p className="mt-1 text-body-sm text-[--color-text-secondary]">
              Current period: {currentPeriod.periodStart.toISOString().slice(0, 10)} –{" "}
              {currentPeriod.periodEnd.toISOString().slice(0, 10)}{" "}
              <Badge variant={currentPeriod.status === "LOCKED" ? "success" : "warning"}>{currentPeriod.status}</Badge>
            </p>
          </div>
          <Link href={`/pay/pay-periods/${currentPeriod.id}`}>
            <Button variant="primary">Upload Compass statement</Button>
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyStatCard label="Total owed this period" valuePence={totalOwedPence} sparklineData={periods.map((_, i) => i + 1).reverse()} />
          <StatCard label="Dentists paid" value={dentistsPaid} />
          <MoneyStatCard label="Lab deductions (all-time, 50%)" valuePence={labDeductionsPence} />
          <StatCard label="Registered clinicians" value={dentistCount} />
        </div>

        {needsReview > 0 && (
          <Card className="mt-6 flex items-center justify-between" accentColor="var(--color-warning)">
            <div className="flex items-center gap-3">
              <FileWarning className="size-5 text-[--color-warning]" />
              <div>
                <p className="text-body font-medium text-[--color-text-primary]">{needsReview} Compass line(s) need manual review</p>
                <p className="text-body-sm text-[--color-text-secondary]">Unmatched performer numbers or a name mismatch since the last statement.</p>
              </div>
            </div>
            <Link href={`/pay/pay-periods/${currentPeriod.id}`}>
              <Button variant="secondary">Review now</Button>
            </Link>
          </Card>
        )}

        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>This period's payslips</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-body-sm text-[--color-text-secondary]">No payslip entries calculated for this period yet.</p>
              ) : (
                <StaggerList className="divide-y divide-[--color-border-subtle]">
                  {entries.map((e) => (
                    <StaggerItem key={e.id} className="flex items-center justify-between py-3">
                      <span className="text-body-sm text-[--color-text-primary]">{e.dentist.name}</span>
                      <span className="tabular-nums font-[--font-mono] text-body-sm text-[--color-text-primary]">{money(e.finalPayPence ?? 0)}</span>
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
