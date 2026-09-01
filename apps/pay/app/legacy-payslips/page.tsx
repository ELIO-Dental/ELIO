import Link from "next/link";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import {
  EmptyState,
  PageContent,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePanel,
  TablePagination,
  TableRow,
  TableToolbar,
  formatMoneyGBPOrDash,
  parseTablePage,
} from "@elio/ui";
import { redirectToLogin } from "@/lib/session";
import { formatLegacyPeriodLabel, legacyPayslipSummary, parseLegacyPayslipRow } from "@/lib/legacy-payslip-archive";

export default async function LegacyPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; dentist?: string; year?: string }>;
}) {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const params = await searchParams;
  const { page, skip, pageSize } = parseTablePage(params);
  const dentist = params.dentist?.trim();
  const year = params.year ? Number(params.year) : undefined;

  const db = scopedDb(session.practiceId);
  const where = {
    ...(dentist ? { dentistName: { contains: dentist, mode: "insensitive" as const } } : {}),
    ...(year ? { periodYear: year } : {}),
  };

  const [rows, totalCount] = await Promise.all([
    db.legacyPayslipArchive.findMany({
      where,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { dentistName: "asc" }],
      skip,
      take: pageSize,
    }),
    db.legacyPayslipArchive.count({ where }),
  ]);

  return (
    <PageContent>
      <PageHeader
        title="Legacy payslip archive"
        description="Read-only pre-migration payslips preserved from the old ElioPay system."
      />

      <div className="mt-8">
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Archived payslips" />}>
            <EmptyState
              title="No archived payslips"
              description="Legacy payslips appear here after migration from the old Turso database."
              className="py-12"
            />
          </TablePanel>
        ) : (
          <TablePanel
            toolbar={<TableToolbar title="Archived payslips" />}
            footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Dentist</TableHead>
                  <TableHead className="text-right">Gross private</TableHead>
                  <TableHead className="text-right">NHS UDAs</TableHead>
                  <TableHead className="text-right">Patients</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const summary = legacyPayslipSummary(parseLegacyPayslipRow(row.rawRowJson));
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{formatLegacyPeriodLabel(row.periodMonth, row.periodYear)}</TableCell>
                      <TableCell>{row.dentistName}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoneyGBPOrDash(Math.round(summary.grossPrivate * 100))}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{summary.nhsUdas || "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{summary.patientCount}</TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/legacy-payslips/${row.id}`}
                          className="text-body-sm font-medium text-(--color-brand) hover:underline"
                        >
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TablePanel>
        )}
      </div>
    </PageContent>
  );
}
