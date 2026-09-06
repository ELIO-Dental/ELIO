import { requireLicensedSession } from "@/lib/session";
import { listRedeems } from "@/lib/plans-service";
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
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { RedeemActions } from "./redeem-actions";
import { RedeemsFilterBar } from "./redeems-filter-bar";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  PARTIALLY_EARNED: "info",
};

const FILTER_STATUSES = new Set(["PENDING_APPROVAL", "APPROVED", "REJECTED"]);

export default async function RedeemsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await requireLicensedSession();
  const params = await searchParams;
  const { page, skip, pageSize } = parseTablePage(params);
  const statusFilter = params.status && FILTER_STATUSES.has(params.status) ? params.status : undefined;

  const allRedeems = await listRedeems(session.practiceId, statusFilter);
  const totalCount = allRedeems.length;
  const redeems = allRedeems.slice(skip, skip + pageSize);

  return (
    <PageContent>
      <PageHeader
        title="Redeems"
        description="Benefit redemption requests. Approving or rejecting a pending redeem is recorded in the audit log."
      />

      <div className="mt-8">
        <TablePanel
          toolbar={
            <TableToolbar title="Redemption requests">
              <RedeemsFilterBar />
            </TableToolbar>
          }
          footer={totalCount > 0 ? <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} /> : undefined}
        >
          {totalCount === 0 ? (
            <EmptyState
              title={statusFilter ? "No redeems match" : "No redeems yet"}
              description={
                statusFilter
                  ? "Try another status filter, or clear the filter to see all requests."
                  : "Redemption requests will appear here."
              }
              className="py-12"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redeems.map((r) => {
                  const name =
                    [r.planPatient.patient.firstName, r.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{name}</TableCell>
                      <TableCell>
                        {r.itemName}
                        <span className="ml-2 text-body-sm text-(--color-text-tertiary)">{r.itemType}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-(--color-text-tertiary)">{r.createdAt.toISOString().slice(0, 10)}</TableCell>
                      <TableCell>
                        {r.status === "PENDING_APPROVAL" ? (
                          <RedeemActions redeemId={r.id} />
                        ) : (
                          <span className="text-body-sm text-(--color-text-tertiary)">
                            {r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Rejected" : "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TablePanel>
      </div>
    </PageContent>
  );
}
