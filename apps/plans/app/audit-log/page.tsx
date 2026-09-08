import { requireLicensedSession } from "@/lib/session";
import { scopedDb } from "@elio/db";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  PageContent,
  PageHeader,
  TablePanel,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { AuditLogEmptyState } from "@/components/audit-log-empty-state";
import { AuditFilterBar } from "./audit-filter-bar";

function moduleForAction(action: string): { label: string; variant: "info" | "neutral" } {
  if (action.startsWith("plans.")) return { label: "Plans", variant: "info" };
  return { label: "Practice", variant: "neutral" };
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; targetType?: string }>;
}) {
  const session = await requireLicensedSession();
  const params = await searchParams;
  const { page, skip, pageSize } = parseTablePage(params);
  const targetType = params.targetType?.trim() || undefined;

  const db = scopedDb(session.practiceId);
  const where = targetType ? { targetType } : {};
  const [logs, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
  ]);

  return (
    <PageContent width="full">
      <PageHeader
        title="Audit Log"
        description="Every recorded action for your practice, including Plans-specific decisions like redeem approvals and rejections."
      />

      <div className="mt-6 sm:mt-8">
        <TablePanel
          toolbar={
            <TableToolbar title="Audit entries">
              <AuditFilterBar />
            </TableToolbar>
          }
          footer={totalCount > 0 ? <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} /> : undefined}
        >
          {totalCount === 0 ? (
            <AuditLogEmptyState
              title={targetType ? "No matching audit entries" : "No audit entries yet"}
              description={
                targetType
                  ? "Try another entity type, or clear the filter to see all entries."
                  : "Recorded actions will appear here."
              }
              className="py-12"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const mod = moduleForAction(log.action);
                  const details =
                    log.metadata != null
                      ? typeof log.metadata === "string"
                        ? log.metadata
                        : JSON.stringify(log.metadata)
                      : null;
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="text-(--color-text-tertiary)">
                        {log.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                      </TableCell>
                      <TableCell>{log.actor?.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={mod.variant}>{mod.label}</Badge>
                      </TableCell>
                      <TableCell className="font-(--font-mono) text-body-sm">{log.action}</TableCell>
                      <TableCell className="text-(--color-text-secondary)">
                        {log.targetType}
                        <span className="ml-1 text-(--color-text-tertiary)">{log.targetId}</span>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-caption text-(--color-text-tertiary)" title={details ?? undefined}>
                        {details ?? "—"}
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
