import { requireLicensedSession } from "@/lib/session";
import { listPlans } from "@/lib/plans-service";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  Badge,
  PageContent,
  PageHeader,
  TablePanel,
  TableCellMoney,
  formatMoneyGBP,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { NewPlanForm } from "./new-plan-form";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireLicensedSession();
  const { page, skip, pageSize } = parseTablePage(await searchParams);

  const allPlans = await listPlans(session.practiceId);
  const totalCount = allPlans.length;
  const plans = allPlans.slice(skip, skip + pageSize);

  return (
    <PageContent>
      <PageHeader title="Plans" description="Membership plan models patients can enrol on." />

      <div className="mt-8">
        <NewPlanForm />
      </div>

      <div className="mt-8">
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Plan models" />}>
            <EmptyState title="No plans yet" description="Add your first plan above." className="py-12" />
          </TablePanel>
        ) : (
          <TablePanel
            toolbar={<TableToolbar title="Plan models" />}
            footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Monthly price</TableHead>
                  <TableHead>Inclusions</TableHead>
                  <TableHead>Discounts</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCellMoney>{formatMoneyGBP(p.monthlyPricePence)}</TableCellMoney>
                    <TableCell>{p.inclusions.length}</TableCell>
                    <TableCell>{p.discounts.length}</TableCell>
                    <TableCell>
                      <Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
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
