import Link from "next/link";
import { requireLicensedSession } from "@/lib/session";
import { listRedeems } from "@/lib/plans-service";
import { prisma } from "@elio/db";
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
  Card,
} from "@elio/ui";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { RedeemActions } from "./redeem-actions";
import { RedeemsFilterBar } from "./redeems-filter-bar";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  PARTIALLY_EARNED: "info",
};

const FILTER_STATUSES = new Set(["PENDING_APPROVAL", "APPROVED", "REJECTED", "PARTIALLY_EARNED"]);

const STATUS_CARDS = [
  { key: "PENDING_APPROVAL", label: "Pending", icon: Clock },
  { key: "APPROVED", label: "Approved", icon: CheckCircle },
  { key: "REJECTED", label: "Rejected", icon: XCircle },
  { key: "PARTIALLY_EARNED", label: "Partial", icon: AlertTriangle },
] as const;

export default async function RedeemsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await requireLicensedSession();
  const params = await searchParams;
  const { page, skip, pageSize } = parseTablePage(params);
  const statusFilter = params.status && FILTER_STATUSES.has(params.status) ? params.status : undefined;

  const [allRedeems, statusCounts] = await Promise.all([
    listRedeems(session.practiceId, statusFilter),
    Promise.all(
      STATUS_CARDS.map(async (c) => ({
        key: c.key,
        count: await prisma.planRedeem.count({
          where: { practiceId: session.practiceId, status: c.key },
        }),
      })),
    ),
  ]);

  const countByStatus = Object.fromEntries(statusCounts.map((s) => [s.key, s.count]));
  const totalCount = allRedeems.length;
  const redeems = allRedeems.slice(skip, skip + pageSize);
  const pendingTotal = countByStatus.PENDING_APPROVAL ?? 0;

  return (
    <PageContent>
      <PageHeader
        title="Redeems"
        description={
          <>
            Track and approve plan benefit redemptions
            {pendingTotal > 0 ? (
              <Badge variant="warning" className="ml-2">
                {pendingTotal} pending
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_CARDS.map((c) => {
          const Icon = c.icon;
          const count = countByStatus[c.key] ?? 0;
          const active = statusFilter === c.key;
          const href = active ? "/redeems" : `/redeems?status=${c.key}`;
          return (
            <Link key={c.key} href={href}>
              <Card
                className={`flex items-center gap-3 px-4 py-3 transition hover:shadow-(--shadow-sm) ${
                  active ? "border-(--color-primary-500) ring-1 ring-(--color-primary-500)/30" : ""
                }`}
              >
                <Icon className="size-8 text-(--color-text-tertiary)" aria-hidden />
                <div>
                  <p className="text-2xl font-bold tabular-nums text-(--color-text-primary)">{count}</p>
                  <p className="text-caption text-(--color-text-secondary)">{c.label}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-8">
        <TablePanel
          toolbar={
            <TableToolbar title="All Redeems">
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
                  <TableHead>Plan</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redeems.map((r) => {
                  const name =
                    [r.planPatient.patient.firstName, r.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  const planName = r.patientPlanEnrolment?.plan?.name ?? "—";
                  const appt = r.appointmentDate
                    ? new Date(r.appointmentDate).toLocaleDateString("en-GB")
                    : r.createdAt.toLocaleDateString("en-GB");
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell>{planName}</TableCell>
                      <TableCell>
                        {r.itemName}
                        {r.isPartial ? (
                          <Badge variant="info" className="ml-2">
                            Partial{r.earnedPercentage != null ? ` ${String(r.earnedPercentage)}%` : ""}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-(--color-text-tertiary)">{r.itemType}</TableCell>
                      <TableCell className="text-(--color-text-tertiary)">{appt}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status] ?? "neutral"}>
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === "PENDING_APPROVAL" ? (
                          <RedeemActions redeemId={r.id} />
                        ) : (
                          <span className="text-body-sm text-(--color-text-tertiary)">
                            {r.status === "APPROVED"
                              ? "Approved"
                              : r.status === "REJECTED"
                                ? "Rejected"
                                : "—"}
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
