import { notFound } from "next/navigation";
import { auth } from "@elio/auth";
import { scopedDb, type Role } from "@elio/db";
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
import { redirectToLogin, redirectToLauncher } from "@/lib/session";
import { buildOpsReviewList } from "@/lib/ops-review";
import { flattenPayslipLinesForOpsReview } from "@/lib/ops-review-lines";
import { isAlreadyPaidInOtherPeriod } from "@/lib/paid-invoice-line-log";
import { loadPaidLogLookup } from "@/lib/paid-invoice-line-log-db";
import { getPaySettings } from "@/lib/pay-settings-service";
import { canPayViewAny, resolvePayPractitionerScope } from "@/lib/pay-scope";
import { filterPayslipsForScope } from "@/lib/pay-scope-utils";
import { CompassUploadForm } from "./compass-upload-form";
import { NhsStatementPanel } from "./nhs-statement-panel";
import { PayPeriodActionsProvider } from "./pay-period-actions-provider";
import { PeriodHeaderActions } from "./period-header-actions";
import { PeriodActionAlerts } from "./period-action-alerts";
import { ManualReviewList } from "./manual-review-list";
import { CalculateAndLockPanel } from "./calculate-and-lock-panel";
import { FetchResultsBanner } from "./fetch-results-banner";
import { OperationsReviewPanel } from "./operations-review-panel";
import { PayslipAccordion, PayslipAccordionItem } from "./payslip-accordion";
import { PayslipEntryBody } from "./payslip-entry-body";
import { PeriodPayslipSummaryTable } from "./period-payslip-summary-table";
import { buildPeriodPayslipSummaryRows, formatDecimalLabel } from "@/lib/period-payslip-summary";
import { resolveFinanceFeeSplit } from "@/lib/pay-settings";
import { resolveShareBp } from "@/lib/dentist-rates";
import { financeFeesDeductionPence } from "@/lib/private-revenue";
import { resolveFinanceFeesForDeduction } from "@/lib/finance-fee";
import { formatPayslipPaymentDate } from "@/lib/payslip-pdf";
import { ACTIVE_DENTIST_WHERE } from "@/lib/active-dentists";
import { ensurePayslipStubsForPeriod } from "@/lib/ensure-payslip-stubs";
import {
  formatPayPeriodMonthLabel,
  formatPayPeriodStatusLabel,
} from "@/lib/pay-dashboard-labels";
import { PeriodPayrollTotalsBanner } from "./period-payroll-totals-banner";
import type { FetchResult } from "./pay-period-actions-provider";

export default async function PayPeriodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.practiceId || !session.userId) return redirectToLogin();
  // Step 13/30 ACL — ops/admin/finance/auditor (pay:view*) or linked clinician (own).
  if (!canPayViewAny({ role: session.role as Role })) {
    return redirectToLauncher("error=forbidden");
  }
  const { id } = await params;
  const subject = { role: session.role as Role, userId: session.userId };
  const scope = await resolvePayPractitionerScope(session.practiceId, subject);
  if (!scope.viewAll && !scope.dentistId) {
    return redirectToLauncher("error=forbidden");
  }
  const viewAll = scope.viewAll;

  const db = scopedDb(session.practiceId);
  const [payPeriod, dentists, paySettings] = await Promise.all([
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
    db.dentist.findMany({ where: ACTIVE_DENTIST_WHERE, orderBy: { name: "asc" } }),
    getPaySettings(session.practiceId),
  ]);

  if (!payPeriod) notFound();

  // AuraPay: dentist cards exist immediately — seed stubs before render when draft.
  if (viewAll && payPeriod.status === "DRAFT") {
    const seeded = await ensurePayslipStubsForPeriod(session.practiceId, payPeriod.id);
    if (seeded > 0) {
      const refreshed = await db.payPeriod.findUnique({
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
      });
      if (refreshed) {
        Object.assign(payPeriod, refreshed);
      }
    }
  }

  // Step 30 — clinicians only see their own payslip rows.
  const visibleEntries = filterPayslipsForScope(payPeriod.payslipEntries, scope);
  payPeriod.payslipEntries = visibleEntries;

  const priorPeriod = viewAll
    ? await db.payPeriod.findFirst({
        where: { periodEnd: { lt: payPeriod.periodStart } },
        orderBy: { periodEnd: "desc" },
        include: {
          payslipEntries: {
            include: {
              dentist: true,
              privateRevenueLineItems: true,
            },
          },
        },
      })
    : null;

  const currentLines = viewAll ? flattenPayslipLinesForOpsReview(payPeriod.payslipEntries) : [];
  const paidLogLookup = viewAll ? await loadPaidLogLookup(db, session.practiceId) : new Map();
  const paidLogDuplicateHits = viewAll
    ? currentLines
        .map((line) => {
          const prior = isAlreadyPaidInOtherPeriod(line, paidLogLookup, payPeriod.id, line.dentistId);
          return prior ? { line, priorPeriodId: prior.payPeriodId } : null;
        })
        .filter((x): x is { line: (typeof currentLines)[number]; priorPeriodId: string } => Boolean(x))
    : [];

  const opsReviewItems = viewAll
    ? buildOpsReviewList({
        currentLines,
        priorPaidLines: priorPeriod
          ? flattenPayslipLinesForOpsReview(priorPeriod.payslipEntries)
          : [],
        priorPeriodId: priorPeriod?.id ?? null,
        fetchResultJson: payPeriod.dentallyFetchResultJson,
        paidLogDuplicateHits,
      })
    : [];

  const visibleDentists = viewAll
    ? dentists
    : dentists.filter((d) => d.id === scope.dentistId);
  const nhsDentists = visibleDentists.filter((d) => d.nhsPerformerNumber);
  const nhsPeriodStart = payPeriod.nhsPeriodStart?.toISOString().slice(0, 10) ?? null;
  const nhsPeriodEnd = payPeriod.nhsPeriodEnd?.toISOString().slice(0, 10) ?? null;

  const needsReviewLines = viewAll
    ? payPeriod.compassStatements.flatMap((s) => s.lines).filter((l) => l.matchConfidence === "NEEDS_REVIEW")
    : [];

  const splitDentistIds = visibleDentists.filter((d) => d.payType === "PERCENTAGE_SPLIT").map((d) => d.id);
  const financeRates = {
    finance_rate_3m: paySettings.finance_rate_3m,
    finance_rate_12m: paySettings.finance_rate_12m,
    finance_rate_36m: paySettings.finance_rate_36m,
    finance_rate_60m: paySettings.finance_rate_60m,
  };
  const anyProvisional = payPeriod.payslipEntries.some((p) => p.provisional);
  const practiceFinanceBp = resolveFinanceFeeSplit(paySettings);
  const summaryRows = buildPeriodPayslipSummaryRows(
    payPeriod.payslipEntries.map((p) => ({
      id: p.id,
      dentistName: p.dentist.name,
      payType: p.payType,
      udas: p.udas,
      privateSplitPercent: p.privateSplitPercent,
      nhsEarningsPence: p.nhsEarningsPence,
      grossPrivateRevenuePence: p.grossPrivateRevenuePence,
      privateEarningsPence: p.privateEarningsPence,
      labDeductionPence: p.labDeductionPence,
      superannuationPence: p.superannuationPence,
      therapyMinutes: p.therapyMinutes != null ? Number(p.therapyMinutes) : null,
      therapyRatePerMinute: p.therapyRatePerMinute != null ? Number(p.therapyRatePerMinute) : null,
      therapyHourlyPence: p.dentist.therapyHourlyPence,
      financeLines: resolveFinanceFeesForDeduction(p.privateRevenueLineItems, financeRates),
      financeShareBp: p.dentist.financeShareBp,
      practiceFinanceBp,
      manualAdjustmentsPence: p.manualAdjustmentsPence,
      finalPayPence: p.finalPayPence,
      provisional: p.provisional,
      invoicedGrossPence: p.privateRevenueLineItems.reduce((sum, line) => sum + line.amountPence, 0),
    }))
  );

  const initialFetchResult =
    payPeriod.dentallyFetchStatus === "SUCCESS" && payPeriod.dentallyFetchResultJson
      ? (payPeriod.dentallyFetchResultJson as unknown as FetchResult)
      : null;
  const needsCalc = payPeriod.payslipEntries.some(
    (p) =>
      p.finalPayPence == null &&
      (p.privateRevenueLineItems.length > 0 ||
        (p.grossPrivateRevenuePence != null && p.grossPrivateRevenuePence > 0) ||
        (p.labDeductionPence != null && p.labDeductionPence > 0) ||
        (p.udas != null && Number(p.udas) > 0))
  );

  return (
    <PayPeriodActionsProvider
      payPeriodId={payPeriod.id}
      dentistIds={splitDentistIds}
      locked={payPeriod.status === "LOCKED"}
      payslipCount={payPeriod.payslipEntries.length}
      anyProvisional={anyProvisional}
      initialFetchResult={initialFetchResult}
    >
    <PageContent>
      <PageHeader
        title={formatPayPeriodMonthLabel(payPeriod.periodStart)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={payPeriod.status === "LOCKED" ? "success" : "neutral"}>
              {formatPayPeriodStatusLabel(payPeriod.status)}
            </Badge>
            <span className="text-body-sm text-(--color-text-secondary)">
              {payPeriod.payslipEntries.length} dentist
              {payPeriod.payslipEntries.length === 1 ? "" : "s"}
              {" · "}
              Payment date: {formatPayslipPaymentDate(payPeriod.periodStart)}
            </span>
          </span>
        }
        actions={viewAll ? <PeriodHeaderActions /> : undefined}
      />

      {viewAll ? (
        <>
          <PeriodActionAlerts />
          <FetchResultsBanner />
        </>
      ) : null}
      {anyProvisional ? (
        <div
          className="mt-4 rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning)/10 px-4 py-3 text-body-sm text-(--color-warning)"
          data-testid="period-provisional-banner"
        >
          <strong className="font-semibold">PROVISIONAL payslips</strong>
          {" — "}
          Finance term/fee still missing on one or more dentists. Confirm term and/or fee on private patient lines, then recalculate.
        </div>
      ) : null}
      {viewAll && needsCalc && payPeriod.status === "DRAFT" ? (
        <div
          className="mt-4 rounded-(--radius-md) border border-(--color-warning)/40 bg-(--color-warning)/10 px-4 py-3 text-body-sm text-(--color-warning)"
          data-testid="period-stale-figures-banner"
        >
          <strong className="font-semibold">Figures not calculated yet</strong>
          {" — "}
          After Fetch / ops edits, use <strong>Run calculation</strong> so Net Pay and payable gross update. Until then totals show “—”.
        </div>
      ) : null}
      {viewAll ? <OperationsReviewPanel items={opsReviewItems} /> : null}

      <div className="mt-8 flex flex-col gap-8">
        {viewAll ? (
          <>
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
              dentists={visibleDentists.map((d) => ({ id: d.id, name: d.name }))}
            />
          </CardContent>
        </Card>

        {nhsDentists.length > 0 ? (
          <NhsStatementPanel
            payPeriodId={payPeriod.id}
            locked={payPeriod.status === "LOCKED"}
            nhsDentists={nhsDentists.map((d) => ({
              id: d.id,
              name: d.name,
              performerNumber: d.nhsPerformerNumber,
              udaRatePence: d.udaRatePence,
            }))}
            initialPeriodStart={nhsPeriodStart}
            initialPeriodEnd={nhsPeriodEnd}
          />
        ) : null}

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
              dentists={visibleDentists.map((d) => ({ id: d.id, name: d.name, payType: d.payType }))}
              locked={payPeriod.status === "LOCKED"}
            />
          </CardContent>
        </Card>
          </>
        ) : null}

        <section>
          <h2 className="text-h3 text-(--color-text-primary)">{viewAll ? "Payslips" : "My payslip"}</h2>
          {payPeriod.payslipEntries.length === 0 ? (
            <TablePanel className="mt-4">
              <EmptyState
                title={viewAll ? "No dentists for this period yet" : "No payslip for you in this period yet"}
                description={
                  viewAll
                    ? "Add active dentists under Dentists, then reopen this period (stubs are created automatically)."
                    : "Your payslip will appear here once operations have run this period."
                }
                className="py-12"
              />
            </TablePanel>
          ) : (
            <PayslipAccordion className="mt-4">
              <PeriodPayrollTotalsBanner rows={summaryRows} />
              <PeriodPayslipSummaryTable rows={summaryRows} />
              {payPeriod.payslipEntries.map((p) => {
                const isNhs = Boolean(p.dentist.isNhs);
                const financeFeeSplit = resolveShareBp(p.dentist.financeShareBp, practiceFinanceBp);
                const clinicianReadOnly = !viewAll;
                return (
                  <PayslipAccordionItem
                    key={p.id}
                    header={{
                      id: p.id,
                      dentistName: p.dentist.name,
                      privateSplitPercent:
                        p.privateSplitPercent != null
                          ? formatDecimalLabel(p.privateSplitPercent)
                          : null,
                      isNhs,
                      patientCount: p.privateRevenueLineItems.length,
                      finalPayPence: p.finalPayPence,
                      pdfHref: p.pdfUrl || `/pay/api/payslips/${p.id}/pdf`,
                      provisional: p.provisional,
                    }}
                  >
                    <PayslipEntryBody
                      payPeriodId={payPeriod.id}
                      payslipEntryId={p.id}
                      dentistName={p.dentist.name}
                      dentistEmail={p.dentist.email}
                      locked={payPeriod.status === "LOCKED" || clinicianReadOnly}
                      isNhs={isNhs}
                      nhsPeriodStart={nhsPeriodStart}
                      nhsPeriodEnd={nhsPeriodEnd}
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
                      therapyHourlyPence={p.dentist.therapyHourlyPence}
                      hoursWorked={p.hoursWorked}
                      hourlyRatePence={p.hourlyRatePence}
                      hourlyEarningsPence={p.hourlyEarningsPence}
                      manualAdjustmentsPence={p.manualAdjustmentsPence}
                      adjustmentReason={p.adjustmentReason}
                      finalPayPence={p.finalPayPence}
                      dentallyAnalyticsJson={p.dentallyAnalyticsJson}
                      dentallyDiscrepanciesJson={p.dentallyDiscrepanciesJson}
                      dentallyDentistLogJson={p.dentallyDentistLogJson}
                      labBillsJson={p.labBillsJson}
                      adjustmentsJson={p.adjustmentsJson}
                      provisional={p.provisional}
                      financeRates={financeRates}
                      financeFeeSplit={financeFeeSplit}
                      financeFeesDeductionPence={financeFeesDeductionPence(
                        resolveFinanceFeesForDeduction(p.privateRevenueLineItems, financeRates),
                        financeFeeSplit
                      )}
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
                        financeTermMonths: line.financeTermMonths,
                        financeFeeManual: line.financeFeeManual,
                        dentallyInvoiceId: line.dentallyInvoiceId,
                        dentallyLineKey: line.dentallyLineKey,
                        sourceType: line.sourceType,
                        manualCreatedByUserId: line.manualCreatedByUserId,
                        manualNote: line.manualNote,
                        createdAt: line.createdAt,
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
