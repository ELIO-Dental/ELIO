import { redirect } from "next/navigation";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState, Badge } from "@elio/ui";
import { PayNav } from "@/components/pay-nav";
import { NewPayPeriodForm } from "./new-pay-period-form";

export default async function PayPeriodsPage() {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");

  const db = scopedDb(session.practiceId);
  const payPeriods = await db.payPeriod.findMany({
    orderBy: { periodStart: "desc" },
    include: { _count: { select: { payslipEntries: true, compassStatements: true } } },
  });

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Pay periods</h1>

        <div className="mt-6">
          <NewPayPeriodForm />
        </div>

        <div className="mt-8">
          {payPeriods.length === 0 ? (
            <EmptyState title="No pay periods yet" description="Start one above (§6.0 — the exact previous calendar month)." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compass statements</TableHead>
                  <TableHead>Payslips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payPeriods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <a href={`/pay-periods/${p.id}`} className="text-[--color-primary-500] hover:underline">
                        {p.periodStart.toISOString().slice(0, 10)} – {p.periodEnd.toISOString().slice(0, 10)}
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "LOCKED" ? "success" : "neutral"}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>{p._count.compassStatements}</TableCell>
                    <TableCell>{p._count.payslipEntries}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
