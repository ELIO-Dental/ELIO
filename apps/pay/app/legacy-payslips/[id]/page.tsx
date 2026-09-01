import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { redirectToLogin } from "@/lib/session";
import {
  formatLegacyPeriodLabel,
  legacyPayslipAdjustments,
  legacyPayslipLabBills,
  legacyPayslipPatients,
  legacyPayslipSummary,
  parseLegacyPayslipRow,
} from "@/lib/legacy-payslip-archive";

function pounds(value: number): number {
  return Math.round(value * 100);
}

export default async function LegacyPayslipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  const { id } = await params;

  const db = scopedDb(session.practiceId);
  const row = await db.legacyPayslipArchive.findFirst({
    where: { id, practiceId: session.practiceId },
  });
  if (!row) notFound();

  const parsed = parseLegacyPayslipRow(row.rawRowJson);
  const summary = legacyPayslipSummary(parsed);
  const patients = legacyPayslipPatients(parsed);
  const labBills = legacyPayslipLabBills(parsed);
  const adjustments = legacyPayslipAdjustments(parsed);

  return (
    <PageContent>
      <PageHeader
        title={`${row.dentistName} — ${formatLegacyPeriodLabel(row.periodMonth, row.periodYear)}`}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">Legacy archive</Badge>
            <span className="text-body-sm text-(--color-text-tertiary)">Source ID {row.sourceId}</span>
          </div>
        }
        actions={
          <Link href="/legacy-payslips" className="text-body-sm font-medium text-(--color-brand) hover:underline">
            Back to archive
          </Link>
        }
      />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-body-sm">
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">Gross private</span>
              <span className="font-mono tabular-nums">{formatMoneyGBPOrDash(pounds(summary.grossPrivate))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">NHS UDAs</span>
              <span className="font-mono tabular-nums">{summary.nhsUdas || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">Finance fees</span>
              <span className="font-mono tabular-nums">{formatMoneyGBPOrDash(pounds(summary.financeFees))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">Therapy</span>
              <span>
                {summary.therapyMinutes} mins @ £{summary.therapyRate.toFixed(4)}/min
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">Superannuation</span>
              <span className="font-mono tabular-nums">{formatMoneyGBPOrDash(pounds(summary.superannuationDeduction))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">Lab bills total</span>
              <span className="font-mono tabular-nums">{formatMoneyGBPOrDash(pounds(summary.labBillTotal))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-(--color-text-secondary)">Adjustments net</span>
              <span className="font-mono tabular-nums">{formatMoneyGBPOrDash(pounds(summary.adjustmentsTotal))}</span>
            </div>
            {summary.notes ? (
              <div className="border-t border-(--color-border-subtle) pt-3">
                <p className="text-caption font-medium text-(--color-text-secondary)">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-(--color-text-primary)">{summary.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lab bills & adjustments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-body-sm">
            {labBills.length === 0 ? (
              <p className="text-(--color-text-tertiary)">No lab bills recorded.</p>
            ) : (
              <ul className="space-y-2">
                {labBills.map((bill, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{bill.lab_name || "Lab"}</span>
                    <span className="font-mono tabular-nums">{formatMoneyGBPOrDash(pounds(Number(bill.amount) || 0))}</span>
                  </li>
                ))}
              </ul>
            )}
            {adjustments.length > 0 ? (
              <ul className="space-y-2 border-t border-(--color-border-subtle) pt-3">
                {adjustments.map((adj, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {adj.description || "Adjustment"} ({adj.type === "addition" ? "+" : "−"})
                    </span>
                    <span className="font-mono tabular-nums">{formatMoneyGBPOrDash(pounds(Number(adj.amount) || 0))}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {patients.length > 0 ? (
        <div className="mt-8">
          <TablePanel>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((patient, i) => {
                  const name = patient.name ?? patient.patientName ?? "Unknown";
                  const amount = Number(patient.amountPaid ?? patient.amount) || 0;
                  return (
                    <TableRow key={`${name}-${i}`}>
                      <TableCell>{name}</TableCell>
                      <TableCell>{patient.date ?? "—"}</TableCell>
                      <TableCell>{patient.treatment ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoneyGBPOrDash(pounds(amount))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TablePanel>
        </div>
      ) : null}
    </PageContent>
  );
}
