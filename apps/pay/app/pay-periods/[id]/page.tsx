import { redirect, notFound } from "next/navigation";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState } from "@elio/ui";
import { PayNav } from "@/components/pay-nav";
import { CompassUploadForm } from "./compass-upload-form";
import { ManualReviewList } from "./manual-review-list";
import { CalculateAndLockPanel } from "./calculate-and-lock-panel";

function gbp(pence: number | null | undefined) {
  if (pence == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default async function PayPeriodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.practiceId) redirect("/login");
  const { id } = await params;

  const db = scopedDb(session.practiceId);
  const [payPeriod, dentists] = await Promise.all([
    db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: { include: { dentist: true } },
        compassStatements: { include: { lines: { include: { dentist: true } } } },
      },
    }),
    db.dentist.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!payPeriod) notFound();

  const needsReviewLines = payPeriod.compassStatements
    .flatMap((s) => s.lines)
    .filter((l) => l.matchConfidence === "NEEDS_REVIEW");

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center gap-3">
          <h1 className="text-h2 text-[--color-text-primary]">
            {payPeriod.periodStart.toISOString().slice(0, 10)} – {payPeriod.periodEnd.toISOString().slice(0, 10)}
          </h1>
          <Badge variant={payPeriod.status === "LOCKED" ? "success" : "neutral"}>{payPeriod.status}</Badge>
        </div>

        <section className="mt-8">
          <h2 className="text-h3 text-[--color-text-primary]">Compass statement</h2>
          <p className="mt-1 text-body-sm text-[--color-text-secondary]">
            Upload the NHSBSA Contract Monthly Pay Statement PDF for this period (§6.2).
          </p>
          <div className="mt-4">
            <CompassUploadForm payPeriodId={payPeriod.id} />
          </div>
          <ManualReviewList
            lines={needsReviewLines.map((l) => ({
              id: l.id,
              performerNumber: l.performerNumber,
              rawDentistName: l.rawDentistName,
              udas: l.udas?.toString() ?? null,
              superannuationPence: l.superannuationPence,
            }))}
            dentists={dentists.map((d) => ({ id: d.id, name: d.name }))}
          />
        </section>

        <section className="mt-10">
          <h2 className="text-h3 text-[--color-text-primary]">Run &amp; lock</h2>
          <CalculateAndLockPanel
            payPeriodId={payPeriod.id}
            dentists={dentists.map((d) => ({ id: d.id, name: d.name, payType: d.payType }))}
            locked={payPeriod.status === "LOCKED"}
          />
        </section>

        <section className="mt-10">
          <h2 className="text-h3 text-[--color-text-primary]">Payslips</h2>
          {payPeriod.payslipEntries.length === 0 ? (
            <EmptyState title="No payslips calculated yet" description="Run the calculation above once Compass data is loaded." className="mt-4" />
          ) : (
            <div className="mt-4 space-y-6">
              {payPeriod.payslipEntries.map((p) => (
                <div key={p.id} className="rounded-[--radius-lg] border border-[--color-border] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-body font-semibold">{p.dentist.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-money font-semibold tabular-nums">{gbp(p.finalPayPence)}</span>
                      <a
                        href={`/pay/api/payslips/${p.id}/pdf`}
                        className="text-body-sm font-medium text-[--color-brand] underline underline-offset-2"
                      >
                        Download PDF
                      </a>
                    </div>
                  </div>
                  <Table className="mt-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Figure</TableHead>
                        <TableHead>Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.payType === "PERCENTAGE_SPLIT" ? (
                        <>
                          <TableRow><TableCell>UDAs</TableCell><TableCell>{p.udas?.toString() ?? "—"}</TableCell></TableRow>
                          <TableRow><TableCell>UDA rate</TableCell><TableCell>{gbp(p.udaRatePence)}</TableCell></TableRow>
                          <TableRow><TableCell>NHS earnings</TableCell><TableCell>{gbp(p.nhsEarningsPence)}</TableCell></TableRow>
                          <TableRow><TableCell>Gross private revenue</TableCell><TableCell>{gbp(p.grossPrivateRevenuePence)}</TableCell></TableRow>
                          <TableRow><TableCell>Private split %</TableCell><TableCell>{p.privateSplitPercent?.toString() ?? "—"}%</TableCell></TableRow>
                          <TableRow><TableCell>Private earnings</TableCell><TableCell>{gbp(p.privateEarningsPence)}</TableCell></TableRow>
                          <TableRow><TableCell>Consultation exclusions</TableCell><TableCell>{gbp(p.consultationExclusionsPence)}</TableCell></TableRow>
                          <TableRow><TableCell>Lab deduction</TableCell><TableCell>-{gbp(p.labDeductionPence)}</TableCell></TableRow>
                          <TableRow><TableCell>Superannuation</TableCell><TableCell>-{gbp(p.superannuationPence)}</TableCell></TableRow>
                        </>
                      ) : (
                        <>
                          <TableRow><TableCell>Hours worked</TableCell><TableCell>{p.hoursWorked?.toString() ?? "—"}</TableCell></TableRow>
                          <TableRow><TableCell>Hourly rate</TableCell><TableCell>{gbp(p.hourlyRatePence)}</TableCell></TableRow>
                          <TableRow><TableCell>Hourly earnings</TableCell><TableCell>{gbp(p.hourlyEarningsPence)}</TableCell></TableRow>
                        </>
                      )}
                      <TableRow><TableCell>Adjustments</TableCell><TableCell>{gbp(p.manualAdjustmentsPence)}</TableCell></TableRow>
                      <TableRow><TableCell className="font-semibold">Final pay</TableCell><TableCell className="font-semibold">{gbp(p.finalPayPence)}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
