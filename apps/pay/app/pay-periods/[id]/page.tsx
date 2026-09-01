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
  TablePanel,
} from "@elio/ui";
import { redirectToLogin } from "@/lib/session";
import { CompassUploadForm } from "./compass-upload-form";
import { PayPeriodActionsProvider } from "./pay-period-actions-provider";
import { PeriodHeaderActions } from "./period-header-actions";
import { PeriodActionAlerts } from "./period-action-alerts";
import { ManualReviewList } from "./manual-review-list";
import { CalculateAndLockPanel } from "./calculate-and-lock-panel";
import { FetchResultsBanner } from "./fetch-results-banner";
import { PayslipAccordion, PayslipAccordionItem } from "./payslip-accordion";
import { PayslipEntryBody } from "./payslip-entry-body";

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
        description={
          <Badge variant={payPeriod.status === "LOCKED" ? "success" : "neutral"}>
            {payPeriod.status === "LOCKED" ? "Finalized" : "Draft"}
          </Badge>
        }
        actions={<PeriodHeaderActions />}
      />

      <PeriodActionAlerts />
      <FetchResultsBanner />

      <div className="mt-8 flex flex-col gap-8">
        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Dentally</CardTitle>
            <p className="text-body-sm text-(--color-text-secondary)">
              Pull private invoice data for this pay period from Dentally using the header button, then run calculation.
            </p>
          </CardHeader>
          <CardContent>
            <p className="text-body-sm text-(--color-text-tertiary)">
              Use <strong>Fetch from Dentally</strong> in the page header. Summary stats appear in the banner above after each fetch.
            </p>
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
            <PayslipAccordion className="mt-4">
              {payPeriod.payslipEntries.map((p) => {
                const isNhs = Boolean(p.dentist.nhsPerformerNumber) || (p.nhsEarningsPence ?? 0) > 0;
                return (
                  <PayslipAccordionItem
                    key={p.id}
                    header={{
                      id: p.id,
                      dentistName: p.dentist.name,
                      privateSplitPercent: p.privateSplitPercent?.toString() ?? null,
                      isNhs,
                      patientCount: p.privateRevenueLineItems.length,
                      finalPayPence: p.finalPayPence,
                      pdfHref: `/pay/api/payslips/${p.id}/pdf`,
                    }}
                  >
                    <PayslipEntryBody
                      payPeriodId={payPeriod.id}
                      payslipEntryId={p.id}
                      locked={payPeriod.status === "LOCKED"}
                      payType={p.payType}
                      udas={p.udas}
                      udaRatePence={p.udaRatePence}
                      nhsEarningsPence={p.nhsEarningsPence}
                      grossPrivateRevenuePence={p.grossPrivateRevenuePence}
                      privateSplitPercent={p.privateSplitPercent}
                      privateEarningsPence={p.privateEarningsPence}
                      consultationExclusionsPence={p.consultationExclusionsPence}
                      labDeductionPence={p.labDeductionPence}
                      superannuationPence={p.superannuationPence}
                      therapyMinutes={p.therapyMinutes != null ? Number(p.therapyMinutes) : null}
                      therapyRatePerMinute={p.therapyRatePerMinute != null ? Number(p.therapyRatePerMinute) : null}
                      hoursWorked={p.hoursWorked}
                      hourlyRatePence={p.hourlyRatePence}
                      hourlyEarningsPence={p.hourlyEarningsPence}
                      manualAdjustmentsPence={p.manualAdjustmentsPence}
                      finalPayPence={p.finalPayPence}
                      dentallyAnalyticsJson={p.dentallyAnalyticsJson}
                      privateRevenueLineItems={p.privateRevenueLineItems.map((line) => ({
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
                        flagReason: line.flagReason,
                        treatmentDescription: line.treatmentDescription,
                        financeFeePence: line.financeFeePence,
                      }))}
                    />
                  </PayslipAccordionItem>
                );
              })}
            </PayslipAccordion>
          )}
        </section>
      </div>
    </PageContent>
    </PayPeriodActionsProvider>
  );
}
