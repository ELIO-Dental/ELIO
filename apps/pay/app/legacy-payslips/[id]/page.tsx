import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@elio/auth";
import { scopedDb, type Role } from "@elio/db";
import {
  Badge,
  PageContent,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
  formatMoneyGBPOrDash,
} from "@elio/ui";
import { redirectToLogin, redirectUnlessPayViewAll } from "@/lib/session";
import {
  formatLegacyDiscrepancyType,
  formatLegacyPeriodLabel,
  legacyPayslipAdjustments,
  legacyPayslipAnalytics,
  legacyPayslipDentistLog,
  legacyPayslipDiscrepancies,
  legacyPayslipLabBills,
  legacyPayslipNhsPeriod,
  legacyPayslipPatients,
  legacyPayslipSummary,
  legacyPayslipTherapyBreakdown,
  parseLegacyPayslipRow,
} from "@/lib/legacy-payslip-archive";

function pounds(value: number): number {
  return Math.round(value * 100);
}

function fmtIsoDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function LegacyPayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  await redirectUnlessPayViewAll(session.role as Role);
  const { id } = await params;

  const db = scopedDb(session.practiceId);
  const row = await db.legacyPayslipArchive.findFirst({
    where: { id, practiceId: session.practiceId },
  });
  if (!row) notFound();

  const parsed = parseLegacyPayslipRow(row.rawRowJson);
  const dentist = await db.dentist.findFirst({
    where: { name: { equals: row.dentistName, mode: "insensitive" } },
    select: { privateSplitPercent: true, udaRatePence: true, isNhs: true },
  });
  const summary = legacyPayslipSummary(parsed, {
    splitPercent: dentist?.privateSplitPercent != null ? Number(dentist.privateSplitPercent) : 50,
    udaRate: dentist?.udaRatePence != null ? dentist.udaRatePence / 100 : 0,
  });
  const patients = legacyPayslipPatients(parsed);
  const labBills = legacyPayslipLabBills(parsed);
  const adjustments = legacyPayslipAdjustments(parsed);
  const discrepancies = legacyPayslipDiscrepancies(parsed);
  const dentistLog = legacyPayslipDentistLog(parsed);
  const analytics = legacyPayslipAnalytics(parsed);
  const therapyBreakdown = legacyPayslipTherapyBreakdown(parsed);
  const nhsPeriod = legacyPayslipNhsPeriod(parsed);
  const nhsStart = nhsPeriod?.start || nhsPeriod?.nhs_period_start;
  const nhsEnd = nhsPeriod?.end || nhsPeriod?.nhs_period_end;
  const showNhsBanner = Boolean(summary.nhsUdas > 0 || dentist?.isNhs || nhsStart);

  const paidTotal = patients.reduce((s, p) => s + (Number(p.amountPaid ?? p.amount) || 0), 0);
  const outstandingTotal = patients.reduce((s, p) => s + (Number(p.amountOutstanding) || 0), 0);

  return (
    <PageContent>
      <PageHeader
        title={`${row.dentistName} — ${formatLegacyPeriodLabel(row.periodMonth, row.periodYear)}`}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Archived</Badge>
            <span className="text-body-sm text-(--color-text-tertiary)">
              {summary.splitPercent}% split
              {dentist?.isNhs || summary.nhsUdas > 0 ? " · NHS" : ""}
              {patients.length > 0 ? ` · ${patients.length} patients` : ""}
            </span>
          </div>
        }
        actions={
          <Link href="/legacy-payslips" className="text-body-sm font-medium text-(--color-brand) hover:underline">
            Back to archive
          </Link>
        }
      />

      <div className="mx-auto mt-8 max-w-5xl space-y-6">
        <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-caption text-(--color-text-tertiary)">Net Pay</p>
              <p className="text-h2 font-semibold tabular-nums" data-testid="legacy-net-pay">
                {formatMoneyGBPOrDash(pounds(summary.netPay))}
              </p>
            </div>
          </div>
        </div>

        {showNhsBanner ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
            <span className="text-xs font-medium text-blue-800">NHS Period:</span>
            <span className="text-xs text-blue-700">
              {nhsStart && nhsEnd
                ? `${fmtIsoDate(nhsStart)} – ${fmtIsoDate(nhsEnd)}`
                : formatLegacyPeriodLabel(row.periodMonth, row.periodYear)}
            </span>
            <span className="text-[10px] text-blue-500">
              ({summary.nhsUdas} UDAs @ £{summary.udaRate}/UDA)
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Gross Private" value={formatMoneyGBPOrDash(pounds(summary.grossPrivate))} />
          <Metric label="Net Private" value={formatMoneyGBPOrDash(pounds(summary.netPrivate))} />
          <Metric label="NHS Income" value={formatMoneyGBPOrDash(pounds(summary.nhsIncome))} />
          <Metric
            label="Total Deductions"
            value={`-${formatMoneyGBPOrDash(pounds(summary.totalDeductions))}`}
            danger
          />
        </div>

        {summary.totalDeductions > 0 || summary.therapyMinutes > 0 || summary.superannuationDeduction > 0 ? (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-800">
              Deductions Breakdown
            </h3>
            <div className="space-y-1.5 text-xs text-red-700">
              {summary.labBillsDeduction > 0 ? (
                <div className="flex justify-between">
                  <span>
                    Lab Bills ({formatMoneyGBPOrDash(pounds(summary.labBillTotal))} total, dentist pays{" "}
                    {Math.round(summary.labBillSplit * 100)}%)
                  </span>
                  <span className="font-medium">
                    -{formatMoneyGBPOrDash(pounds(summary.labBillsDeduction))}
                  </span>
                </div>
              ) : null}
              {summary.financeFeesDeduction > 0 ? (
                <div className="flex justify-between">
                  <span>
                    Finance Fees ({formatMoneyGBPOrDash(pounds(summary.financeFees))} gross,{" "}
                    {Math.round(summary.financeFeeSplit * 100)}% split)
                  </span>
                  <span className="font-medium">
                    -{formatMoneyGBPOrDash(pounds(summary.financeFeesDeduction))}
                  </span>
                </div>
              ) : null}
              {summary.therapyDeduction > 0 ? (
                <div className="flex justify-between">
                  <span>
                    Therapy ({summary.therapyMinutes} mins × £{summary.therapyRate.toFixed(4)}/min)
                  </span>
                  <span className="font-medium">
                    -{formatMoneyGBPOrDash(pounds(summary.therapyDeduction))}
                  </span>
                </div>
              ) : summary.therapyMinutes > 0 ? (
                <div className="flex justify-between text-amber-700">
                  <span>Therapy ({summary.therapyMinutes} mins) — rate not set</span>
                  <span className="font-medium">£0.00</span>
                </div>
              ) : null}
              {summary.superannuationDeduction > 0 ? (
                <div className="flex justify-between">
                  <span>Superannuation</span>
                  <span className="font-medium">
                    -{formatMoneyGBPOrDash(pounds(summary.superannuationDeduction))}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-red-200 pt-1.5 font-bold text-red-900">
                <span>Total Deductions</span>
                <span>-{formatMoneyGBPOrDash(pounds(summary.totalDeductions))}</span>
              </div>
            </div>
          </div>
        ) : null}

        {analytics?.totalChairMins ? (
          <div className="space-y-4 rounded-xl border border-(--color-border-subtle) bg-(--color-bg-subtle) p-4">
            <h3 className="text-sm font-semibold text-(--color-text-primary)">Performance Analytics</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Metric
                label="Chair Time"
                value={`${(analytics.totalChairMins / 60).toFixed(1)}h`}
                hint={`${analytics.totalChairMins} mins`}
              />
              <Metric
                label="Utilization"
                value={`${analytics.utilizationPercent ?? 0}%`}
                hint="of available"
              />
              <Metric
                label="Gross £/Hour"
                value={formatMoneyGBPOrDash(pounds(Number(analytics.grossPerHour) || 0))}
              />
              <Metric
                label="Net £/Hour"
                value={formatMoneyGBPOrDash(pounds(Number(analytics.netPerHour) || 0))}
                hint={`${summary.splitPercent}% split`}
              />
              <Metric
                label="Avg Appt"
                value={`${analytics.avgAppointmentMins ?? 0}m`}
                hint={`${patients.filter((p) => (p.durationMins || 0) > 0).length} appts`}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(analytics.topPatientsByHourlyRate?.length || 0) > 0 ? (
                <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface) p-3">
                  <h4 className="mb-2 text-xs font-semibold text-(--color-text-secondary)">
                    Top Patients by £/hour
                  </h4>
                  <div className="max-h-32 space-y-1.5 overflow-y-auto text-xs">
                    {analytics.topPatientsByHourlyRate!.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.name || "—"}</span>
                        <span className="shrink-0 tabular-nums text-(--color-text-secondary)">
                          {p.durationMins ?? 0}m · £{(p.hourlyRate || 0).toFixed(0)}/h
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {(analytics.topTreatmentsByHourlyRate?.length || 0) > 0 ? (
                <div className="rounded-lg border border-(--color-border-subtle) bg-(--color-surface) p-3">
                  <h4 className="mb-2 text-xs font-semibold text-(--color-text-secondary)">
                    Top Treatments by £/hour
                  </h4>
                  <div className="max-h-32 space-y-1.5 overflow-y-auto text-xs">
                    {analytics.topTreatmentsByHourlyRate!.slice(0, 5).map((t, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="truncate capitalize">{t.treatment || "—"}</span>
                        <span className="shrink-0 tabular-nums text-(--color-text-secondary)">
                          ×{t.count ?? 0} · £{(t.hourlyRate || 0).toFixed(0)}/h
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-primary)">
              Private Patients ({patients.length})
            </h3>
            {patients.length > 0 ? (
              <p className="text-xs text-(--color-text-secondary)">
                <span className="text-green-700">Paid: {formatMoneyGBPOrDash(pounds(paidTotal))}</span>
                {outstandingTotal > 0 ? (
                  <span className="ml-2 text-red-700">
                    Outstanding: {formatMoneyGBPOrDash(pounds(outstandingTotal))}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <TablePanel>
            {patients.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-(--color-text-tertiary)">
                No private patients
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Mins</TableHead>
                    <TableHead className="text-right">£/hr</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Finance</TableHead>
                    <TableHead className="text-right">Fee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((patient, i) => {
                    const name = patient.name ?? patient.patientName ?? "Unknown";
                    const amount = Number(patient.amount) || 0;
                    return (
                      <TableRow key={`${name}-${i}`}>
                        <TableCell>
                          <div>
                            {name}
                            {patient.flagReason && !patient.resolved ? (
                              <p className="text-[10px] text-amber-600">{patient.flagReason}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{patient.date ? fmtIsoDate(patient.date) : "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMoneyGBPOrDash(pounds(amount))}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {patient.durationMins || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {patient.hourlyRate != null ? `£${patient.hourlyRate.toFixed(0)}` : "—"}
                        </TableCell>
                        <TableCell className="text-center capitalize">
                          {patient.status || "—"}
                        </TableCell>
                        <TableCell className="text-center">{patient.finance ? "Yes" : "—"}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {patient.financeFee != null
                            ? formatMoneyGBPOrDash(pounds(patient.financeFee))
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </TablePanel>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-primary)">
            Lab Bills
          </h3>
          {labBills.length === 0 ? (
            <p className="text-xs italic text-(--color-text-tertiary)">No lab bills added</p>
          ) : (
            <div className="space-y-2 rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-3">
              {labBills.map((bill, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-(--color-bg-subtle) px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{bill.lab_name || "Lab"}</p>
                    {bill.description ? (
                      <p className="text-xs text-(--color-text-secondary)">{bill.description}</p>
                    ) : null}
                    {bill.file_url ? (
                      <a
                        href={bill.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-(--color-brand) hover:underline"
                      >
                        View bill
                      </a>
                    ) : null}
                  </div>
                  <span className="font-mono tabular-nums">
                    {formatMoneyGBPOrDash(pounds(Number(bill.amount) || 0))}
                  </span>
                </div>
              ))}
              <p className="text-xs text-(--color-text-secondary)">
                Total: {formatMoneyGBPOrDash(pounds(summary.labBillTotal))} (Dentist pays{" "}
                {Math.round(summary.labBillSplit * 100)}%:{" "}
                {formatMoneyGBPOrDash(pounds(summary.labBillsDeduction))})
              </p>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-primary)">
            Adjustments
          </h3>
          {adjustments.length === 0 ? (
            <p className="text-xs italic text-(--color-text-tertiary)">No adjustments</p>
          ) : (
            <ul className="space-y-2 rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-3 text-sm">
              {adjustments.map((adj, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    {adj.description || "Adjustment"} ({adj.type === "addition" ? "+" : "−"})
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatMoneyGBPOrDash(pounds(Number(adj.amount) || 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {dentistLog.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-primary)">
              Dentist Private Log
            </h3>
            <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-3">
              <p className="mb-2 text-xs text-(--color-text-secondary)">
                Imported log: {dentistLog.length} entries
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {dentistLog.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2 text-(--color-text-secondary)">
                    <span className="truncate">
                      {l.patientName || "—"}
                      {l.date ? ` · ${fmtIsoDate(l.date)}` : ""}
                      {l.treatment ? ` · ${l.treatment}` : ""}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">
                      {formatMoneyGBPOrDash(pounds(Number(l.amount) || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {discrepancies.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-primary)">
              Discrepancies ({discrepancies.filter((d) => !d.resolved).length} unresolved)
            </h3>
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
              {discrepancies.map((d, i) => (
                <div
                  key={i}
                  className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2 ${
                    d.resolved
                      ? "border-green-200 bg-green-50 text-green-800"
                      : "border-amber-200 bg-white text-amber-900"
                  }`}
                >
                  <div>
                    <p className="font-medium">
                      {d.patientName || "—"} · {formatLegacyDiscrepancyType(d.type)}
                      {d.resolved ? " · Resolved" : ""}
                    </p>
                    {d.notes ? <p className="mt-0.5 text-(--color-text-secondary)">{d.notes}</p> : null}
                    {d.date ? <p className="text-(--color-text-tertiary)">{fmtIsoDate(d.date)}</p> : null}
                  </div>
                  <div className="text-right tabular-nums">
                    <p>Invoiced: {formatMoneyGBPOrDash(pounds(Number(d.invoicedAmount) || 0))}</p>
                    <p>Paid: {formatMoneyGBPOrDash(pounds(Number(d.paidAmount) || 0))}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {therapyBreakdown.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-primary)">
              Therapy Breakdown
            </h3>
            <TablePanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Treatment</TableHead>
                    <TableHead className="text-right">Mins</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {therapyBreakdown.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell>{t.patientName || "—"}</TableCell>
                      <TableCell>{t.date ? fmtIsoDate(t.date) : "—"}</TableCell>
                      <TableCell>{t.treatment || t.therapistName || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.minutes ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoneyGBPOrDash(pounds(Number(t.cost) || 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TablePanel>
          </section>
        ) : null}

        {summary.notes ? (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-text-primary)">
              Notes
            </h3>
            <p className="whitespace-pre-wrap rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-4 text-sm text-(--color-text-primary)">
              {summary.notes}
            </p>
          </section>
        ) : null}
      </div>
    </PageContent>
  );
}

function Metric({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 shadow-sm ${
        danger
          ? "border-red-200 bg-red-50"
          : "border-(--color-border-subtle) bg-(--color-surface)"
      }`}
    >
      <p className={`text-xs ${danger ? "text-red-600" : "text-(--color-text-tertiary)"}`}>{label}</p>
      <p className={`mt-0.5 text-sm font-bold tabular-nums ${danger ? "text-red-700" : ""}`}>{value}</p>
      {hint ? <p className="text-[10px] text-(--color-text-tertiary)">{hint}</p> : null}
    </div>
  );
}
