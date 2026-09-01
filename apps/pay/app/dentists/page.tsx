import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import {
  EmptyState,
  PageContent,
  PageHeader,
  TablePanel,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { NewDentistForm } from "./new-dentist-form";
import { DentallyConnectionPanel } from "./dentally-connection-panel";
import { DentistsTable } from "./dentists-table";

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
        <DentallyConnectionPanel />
      </div>

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
            <DentistsTable dentists={dentists} />
          </TablePanel>
        )}
      </div>
    </PageContent>
  );
}
