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

function moduleForAction(action: string): { label: string; variant: "info" | "neutral" } {
  if (action.startsWith("plans.")) return { label: "Plans", variant: "info" };
  return { label: "Practice", variant: "neutral" };
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireLicensedSession();
  const { page, skip, pageSize } = parseTablePage(await searchParams);

  const db = scopedDb(session.practiceId);
  const [logs, totalCount] = await Promise.all([
    db.auditLog.findMany({
      include: { actor: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.auditLog.count(),
  ]);

  return (
    <PageContent>
      <PageHeader
        title="Audit Log"
        description="Every recorded action for your practice, including Plans-specific decisions like redeem approvals and rejections."
      />

      <div className="mt-8">
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Audit entries" />}>
            <AuditLogEmptyState title="No audit entries yet" description="Recorded actions will appear here." className="py-12" />
          </TablePanel>
        ) : (
          <TablePanel
            toolbar={<TableToolbar title="Audit entries" />}
            footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const mod = moduleForAction(log.action);
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
