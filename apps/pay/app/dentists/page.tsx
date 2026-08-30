import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  PageContent,
  PageHeader,
  TablePanel,
  formatMoneyGBP,
  TableCellMoney,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { NewDentistForm } from "./new-dentist-form";

export default async function DentistsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  const { page, skip, pageSize } = parseTablePage(await searchParams);

  const db = scopedDb(session.practiceId);
  const [dentists, totalCount] = await Promise.all([
    db.dentist.findMany({ orderBy: { name: "asc" }, skip, take: pageSize }),
    db.dentist.count(),
  ]);

  return (
    <PageContent>
      <PageHeader title="Dentists" description="Manage dentist profiles and pay configuration." />

      <div className="mt-8">
        <NewDentistForm />
      </div>

      <div className="mt-8">
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Dentists" />}>
            <EmptyState title="No dentists yet" description="Add your first dentist above." className="py-12" />
          </TablePanel>
        ) : (
          <TablePanel
            toolbar={<TableToolbar title="Dentists" />}
            footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>NHS performer #</TableHead>
                  <TableHead>Pay type</TableHead>
                  <TableHead>Split % / UDA rate</TableHead>
                  <TableHead>Hourly rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dentists.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.nhsPerformerNumber ?? "—"}</TableCell>
                    <TableCell>{d.payType}</TableCell>
                    <TableCell>
                      {d.payType === "PERCENTAGE_SPLIT"
                        ? `${d.privateSplitPercent}% / ${formatMoneyGBP(d.udaRatePence ?? 0)}`
                        : "—"}
                    </TableCell>
                    <TableCellMoney>{d.payType === "HOURLY" ? `${formatMoneyGBP(d.hourlyRatePence ?? 0)}/hr` : "—"}</TableCellMoney>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TablePanel>
        )}
      </div>
    </PageContent>
  );
}
