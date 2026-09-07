import Link from "next/link";
import { auth } from "@elio/auth";
import { scopedDb, type Role } from "@elio/db";
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
import { redirectToLogin, redirectUnlessPayViewAll } from "@/lib/session";
import { formatLegacyPeriodLabel, legacyPayslipSummary, parseLegacyPayslipRow } from "@/lib/legacy-payslip-archive";
import { LegacyArchiveFilters } from "./legacy-archive-filters";

export default async function LegacyPayslipsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; dentist?: string; year?: string }>;
}) {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  await redirectUnlessPayViewAll(session.role as Role);
  const params = await searchParams;
  const { page, skip, pageSize } = parseTablePage(params);
  const dentist = params.dentist?.trim() || "";
  const year = params.year ? Number(params.year) : undefined;
  const hasFilters = Boolean(dentist || year);

  const db = scopedDb(session.practiceId);
  const where = {
    ...(dentist ? { dentistName: { contains: dentist, mode: "insensitive" as const } } : {}),
    ...(year ? { periodYear: year } : {}),
  };

  const [rows, totalCount, yearRows, dentists] = await Promise.all([
    db.legacyPayslipArchive.findMany({
      where,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { dentistName: "asc" }],
      skip,
      take: pageSize,
    }),
    db.legacyPayslipArchive.count({ where }),
    db.legacyPayslipArchive.findMany({
      select: { periodYear: true },
      distinct: ["periodYear"],
      orderBy: { periodYear: "desc" },
    }),
    db.dentist.findMany({
      select: { name: true, privateSplitPercent: true, udaRatePence: true },
    }),
  ]);

  const dentistByName = new Map(
    dentists.map((d) => [d.name.trim().toLowerCase(), d] as const)
  );
  const years = yearRows.map((r) => r.periodYear).filter(Boolean);

  return (
    <PageContent>
      <PageHeader
        title="Legacy Archive"
        description="Read-only historical payslips from AuraPay."
      />

      <div className="mt-6">
        <LegacyArchiveFilters dentist={dentist} year={year} years={years} />
      </div>

      <div className="mt-4">
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Archived payslips" />}>
            <EmptyState
              title={hasFilters ? "No matching payslips" : "No archived payslips"}
              description={
                hasFilters
                  ? "Try a different dentist or year."
                  : "No archived payslips for this practice."
              }
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
                  <TableHead className="text-right">Net Pay</TableHead>
                  <TableHead className="text-right">NHS UDAs</TableHead>
                  <TableHead className="text-right">Patients</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const matched = dentistByName.get(row.dentistName.trim().toLowerCase());
                  const summary = legacyPayslipSummary(parseLegacyPayslipRow(row.rawRowJson), {
                    splitPercent:
                      matched?.privateSplitPercent != null
                        ? Number(matched.privateSplitPercent)
                        : 50,
                    udaRate: matched?.udaRatePence != null ? matched.udaRatePence / 100 : 0,
                  });
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{formatLegacyPeriodLabel(row.periodMonth, row.periodYear)}</TableCell>
                      <TableCell>{row.dentistName}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoneyGBPOrDash(Math.round(summary.grossPrivate * 100))}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoneyGBPOrDash(Math.round(summary.netPay * 100))}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {summary.nhsUdas || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {summary.patientCount}
                      </TableCell>
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
