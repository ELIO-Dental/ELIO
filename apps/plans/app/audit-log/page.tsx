import { requireLicensedSession } from "@/lib/session";
import { scopedDb } from "@elio/db";
import { PlansNav } from "@/components/plans-nav";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge } from "@elio/ui";
import { AuditLogEmptyState } from "@/components/audit-log-empty-state";

function moduleForAction(action: string): { label: string; variant: "info" | "neutral" } {
  if (action.startsWith("plans.")) return { label: "Plans", variant: "info" };
  return { label: "Practice", variant: "neutral" };
}

/**
 * Audit Log (MASTER_BUILD_GUIDE.md §1.7) — every AuditLog row for this
 * practice, most recent first. Plans-specific entries (action strings
 * starting "plans." — e.g. plans.redeem.approve/reject, written by
 * lib/plans-service.ts) are labeled "Plans"; general practice entries
 * (team.*, mfa_toggle.*, written elsewhere in the shared shell) are labeled
 * "Practice" so this screen is honest about showing both, per
 * PERMISSIONS_MATRIX.md §2's auditlog:view:all/own scope.
 */
export default async function AuditLogPage() {
  const session = await requireLicensedSession();

  const db = scopedDb(session.practiceId);
  const logs = await db.auditLog.findMany({
    include: { actor: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-[--color-text-primary]">Audit Log</h1>
        <p className="mt-1 text-body text-[--color-text-secondary]">
          Every recorded action for your practice, including Plans-specific decisions like
          redeem approvals and rejections.
        </p>

        <div className="mt-8">
          {logs.length === 0 ? (
            <div className="rounded-[--radius-lg] border border-[--color-border]">
              <AuditLogEmptyState title="No audit entries yet" description="Recorded actions will appear here." />
            </div>
          ) : (
            <div className="rounded-[--radius-lg] border border-[--color-border]">
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
                        <TableCell className="text-[--color-text-tertiary]">
                          {log.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                        </TableCell>
                        <TableCell>{log.actor?.email ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={mod.variant}>{mod.label}</Badge>
                        </TableCell>
                        <TableCell className="font-[--font-mono] text-body-sm">{log.action}</TableCell>
                        <TableCell className="text-[--color-text-secondary]">
                          {log.targetType}
                          <span className="ml-1 text-[--color-text-tertiary]">{log.targetId}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
