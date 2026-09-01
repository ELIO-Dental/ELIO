import { notFound } from "next/navigation";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageContent,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableCellMoney,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
  formatMoneyGBPOrDash,
} from "@elio/ui";
import { redirectToLogin } from "@/lib/session";
import { CompassUploadForm } from "./compass-upload-form";
import { PayPeriodActionsProvider } from "./pay-period-actions-provider";
import { PeriodHeaderActions } from "./period-header-actions";
import { ManualReviewList } from "./manual-review-list";
import { CalculateAndLockPanel } from "./calculate-and-lock-panel";
import { FetchDentallyPanel } from "./fetch-dentally-panel";
import { DentistFetchDetails } from "./dentist-fetch-details";

function asAnalytics(value: unknown): {
  totalChairMins?: number;
  totalPatients?: number;
  grossPerHour?: number;
  netPerHour?: number;
  avgAppointmentMins?: number;
  utilizationPercent?: number;
} | null {
  if (!value || typeof value !== "object") return null;
  return value as {
    totalChairMins?: number;
    totalPatients?: number;
    grossPerHour?: number;
    netPerHour?: number;
    avgAppointmentMins?: number;
    utilizationPercent?: number;
  };
}

export default async function PayPeriodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  const { id } = await params;

  const db = scopedDb(session.practiceId);
  const [payPeriod, dentists] = await Promise.all([
    db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: {
          include: {
            dentist: true,
            privateRevenueLineItems: { orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }] },
          },
        },
        compassStatements: { include: { lines: { include: { dentist: true } } } },
      },
    }),
    db.dentist.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!payPeriod) notFound();

  const needsReviewLines = payPeriod.compassStatements
    .flatMap((s) => s.lines)
    .filter((l) => l.matchConfidence === "NEEDS_REVIEW");

  const splitDentistIds = dentists.filter((d) => d.payType === "PERCENTAGE_SPLIT").map((d) => d.id);

  return (
    <PayPeriodActionsProvider
      payPeriodId={payPeriod.id}
      dentistIds={splitDentistIds}
      locked={payPeriod.status === "LOCKED"}
      payslipCount={payPeriod.payslipEntries.length}
    >
    <PageContent>
      <PageHeader
        title={`${payPeriod.periodStart.toISOString().slice(0, 10)} – ${payPeriod.periodEnd.toISOString().slice(0, 10)}`}
        description={<Badge variant={payPeriod.status === "LOCKED" ? "success" : "neutral"}>{payPeriod.status}</Badge>}
        actions={<PeriodHeaderActions />}
      />

      <div className="mt-8 flex flex-col gap-8">
        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Dentally</CardTitle>
            <p className="text-body-sm text-(--color-text-secondary)">
              Pull private invoice data for this pay period from Dentally, then run calculation.
            </p>
          </CardHeader>
          <CardContent>
            <FetchDentallyPanel />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Compass statement</CardTitle>
            <p className="text-body-sm text-(--color-text-secondary)">
              Upload the NHSBSA Contract Monthly Pay Statement PDF for this period (§6.2).
            </p>
          </CardHeader>
          <CardContent>
            <CompassUploadForm payPeriodId={payPeriod.id} />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Run calculation</CardTitle>
            <p className="text-body-sm text-(--color-text-secondary)">
              Enter private revenue per dentist, run the calculation, then finalize the period from the header when figures are final.
            </p>
          </CardHeader>
          <CardContent>
            <CalculateAndLockPanel
              payPeriodId={payPeriod.id}
              dentists={dentists.map((d) => ({ id: d.id, name: d.name, payType: d.payType }))}
              locked={payPeriod.status === "LOCKED"}
            />
          </CardContent>
        </Card>

        <section>
          <h2 className="text-h3 text-(--color-text-primary)">Payslips</h2>
          {payPeriod.payslipEntries.length === 0 ? (
            <TablePanel className="mt-4">
              <EmptyState title="No payslips calculated yet" description="Run the calculation above once Compass data is loaded." className="py-12" />
            </TablePanel>
          ) : (
            <div className="mt-4 flex flex-col gap-6">
              {payPeriod.payslipEntries.map((p) => (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle>{p.dentist.name}</CardTitle>
                    <div className="flex items-center gap-4">
                      <span className="text-money font-semibold tabular-nums">{formatMoneyGBPOrDash(p.finalPayPence)}</span>
                      <a
                        href={`/pay/api/payslips/${p.id}/pdf`}
                        className="text-body-sm font-medium text-(--color-brand) underline underline-offset-2"
                      >
                        Download PDF
                      </a>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <TablePanel>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Figure</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {p.payType === "PERCENTAGE_SPLIT" ? (
                            <>
                              <TableRow>
                                <TableCell>UDAs</TableCell>
                                <TableCellMoney>{p.udas?.toString() ?? "—"}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>UDA rate</TableCell>
                                <TableCellMoney>{formatMoneyGBPOrDash(p.udaRatePence)}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>NHS earnings</TableCell>
                                <TableCellMoney>{formatMoneyGBPOrDash(p.nhsEarningsPence)}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Gross private revenue</TableCell>
                                <TableCellMoney>{formatMoneyGBPOrDash(p.grossPrivateRevenuePence)}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Private split %</TableCell>
                                <TableCellMoney>{p.privateSplitPercent?.toString() ?? "—"}%</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Private earnings</TableCell>
                                <TableCellMoney>{formatMoneyGBPOrDash(p.privateEarningsPence)}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Consultation exclusions</TableCell>
                                <TableCellMoney>{formatMoneyGBPOrDash(p.consultationExclusionsPence)}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Lab deduction</TableCell>
                                <TableCellMoney>-{formatMoneyGBPOrDash(p.labDeductionPence)}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Superannuation</TableCell>
                                <TableCellMoney>-{formatMoneyGBPOrDash(p.superannuationPence)}</TableCellMoney>
                              </TableRow>
                              {p.therapyMinutes != null && Number(p.therapyMinutes) > 0 ? (
                                <TableRow>
                                  <TableCell>
                                    Therapy ({Number(p.therapyMinutes)} mins
                                    {p.therapyRatePerMinute != null
                                      ? ` @ £${Number(p.therapyRatePerMinute).toFixed(4)}/min`
                                      : ""}
                                    )
                                  </TableCell>
                                  <TableCellMoney>
                                    -
                                    {formatMoneyGBPOrDash(
                                      Math.round(
                                        Number(p.therapyMinutes) * Number(p.therapyRatePerMinute ?? 0) * 100
                                      )
                                    )}
                                  </TableCellMoney>
                                </TableRow>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <TableRow>
                                <TableCell>Hours worked</TableCell>
                                <TableCellMoney>{p.hoursWorked?.toString() ?? "—"}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Hourly rate</TableCell>
                                <TableCellMoney>{formatMoneyGBPOrDash(p.hourlyRatePence)}</TableCellMoney>
                              </TableRow>
                              <TableRow>
                                <TableCell>Hourly earnings</TableCell>
                                <TableCellMoney>{formatMoneyGBPOrDash(p.hourlyEarningsPence)}</TableCellMoney>
                              </TableRow>
                            </>
                          )}
                          <TableRow>
                            <TableCell>Adjustments</TableCell>
                            <TableCellMoney>{formatMoneyGBPOrDash(p.manualAdjustmentsPence)}</TableCellMoney>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-semibold">Final pay</TableCell>
                            <TableCellMoney className="font-semibold">{formatMoneyGBPOrDash(p.finalPayPence)}</TableCellMoney>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TablePanel>
                    <DentistFetchDetails
                      analytics={asAnalytics(p.dentallyAnalyticsJson)}
                      therapyMinutes={p.therapyMinutes != null ? Number(p.therapyMinutes) : null}
                      lines={p.privateRevenueLineItems.map((line) => ({
                        id: line.id,
                        patientName: line.patientName,
                        invoiceDate: line.invoiceDate,
                        amountPence: line.amountPence,
                        amountPaidPence: line.amountPaidPence,
                        amountOutstandingPence: line.amountOutstandingPence,
                        paymentStatus: line.paymentStatus,
                        durationMins: line.durationMins,
                        hourlyRatePence: line.hourlyRatePence,
                        isFinance: line.isFinance,
                        flagged: line.flagged,
                        treatmentDescription: line.treatmentDescription,
                      }))}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContent>
    </PayPeriodActionsProvider>
  );
}
