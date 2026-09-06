import { redirect } from "next/navigation";
import { prisma } from "@elio/db";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  TablePanel,
  TableToolbar,
  TablePagination,
  parseTablePage,
  PageHeader,
} from "@elio/ui";
import { ScrollText } from "lucide-react";
import { auth } from "@/lib/auth";
import { requireMfaComplete } from "@/lib/require-mfa-complete";
import { AuditMetadataCell } from "./audit-metadata-cell";

/** Super-admin audit browser — unscoped AuditLog across all practices. */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) redirect("/login");
  await requireMfaComplete(userId);

  const { page, skip, pageSize } = parseTablePage(await searchParams);
  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      include: {
        actor: { select: { email: true } },
        practice: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.auditLog.count(),
  ]);

  return (
    <div className="space-y-8 pb-8 md:pb-0">
      <PageHeader
        title="Audit"
        description="Platform-wide audit log — actor, practice, action, and target for every recorded change."
      />

      {totalCount === 0 ? (
        <TablePanel toolbar={<TableToolbar title="Audit entries" />}>
          <EmptyState
            icon={ScrollText}
            title="No audit entries yet"
            description="Recorded Super Admin and practice actions will appear here."
            className="py-12"
          />
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
                <TableHead>Practice</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-(--color-text-tertiary)">
                    {log.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                  </TableCell>
                  <TableCell>{log.actor?.email ?? "—"}</TableCell>
                  <TableCell>
                    {log.practice?.name ? (
                      <span className="text-body-sm text-(--color-text-primary)">{log.practice.name}</span>
                    ) : (
                      <span className="text-(--color-text-tertiary)">—</span>
                    )}
                    {log.practiceId && (
                      <span className="mt-0.5 block font-(--font-mono) text-caption text-(--color-text-tertiary)">
                        {log.practiceId}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-(--font-mono) text-body-sm">{log.action}</TableCell>
                  <TableCell className="text-(--color-text-secondary)">
                    {log.targetType}
                    <span className="ml-1 text-(--color-text-tertiary)">{log.targetId}</span>
                  </TableCell>
                  <TableCell>
                    <AuditMetadataCell metadata={log.metadata} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TablePanel>
      )}
    </div>
  );
}
